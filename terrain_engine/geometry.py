
import numpy as np

MOON_RADIUS_M = 1737400.0


def unit_vector(lat, lon):
    """
    Convert latitude and longitude (degrees) into 3D unit vectors.

    Supports scalar inputs and NumPy arrays.
    Output shape: (..., 3)
    """
    lat_rad = np.radians(lat)
    lon_rad = np.radians(lon)

    x = np.cos(lat_rad) * np.cos(lon_rad)
    y = np.cos(lat_rad) * np.sin(lon_rad)
    z = np.sin(lat_rad)

    return np.stack((x, y, z), axis=-1)


def destination(lat, lon, azimuth, distance_m, radius):
    """
    Calculate destination coordinates along a great circle.

    Azimuth convention:
        0° = North
        90° = East
        180° = South
        270° = West

    Supports scalar or array distances.
    """
    if radius <= 0:
        raise ValueError("Radius must be positive")

    lat1 = np.radians(lat)
    lon1 = np.radians(lon)
    alpha = np.radians(azimuth)

    delta = np.asarray(distance_m) / radius

    lat2 = np.arcsin(
        np.sin(lat1) * np.cos(delta)
        + np.cos(lat1) * np.sin(delta) * np.cos(alpha)
    )

    lon2 = lon1 + np.arctan2(
        np.sin(alpha) * np.sin(delta) * np.cos(lat1),
        np.cos(delta) - np.sin(lat1) * np.sin(lat2)
    )

    lat2_deg = np.degrees(lat2)
    lon2_deg = np.degrees(lon2)

    lon2_deg = (lon2_deg + 180) % 360 - 180

    return lat2_deg, lon2_deg


def elevation_angle(observer_pos, terrain_pos, up_vector):
    """
    Calculate terrain elevation angle in degrees.

    Supports one terrain point or multiple terrain points.
    The final dimension must contain [x, y, z].
    """
    obs = np.asarray(observer_pos, dtype=float)
    terrain = np.asarray(terrain_pos, dtype=float)
    up = np.asarray(up_vector, dtype=float)

    d = terrain - obs

    d_norm = np.linalg.norm(d, axis=-1)
    up_norm = np.linalg.norm(up, axis=-1)

    if np.any(d_norm == 0) or np.any(up_norm == 0):
        raise ValueError("Vectors must have non-zero magnitude")

    sin_elevation = np.sum(d * up, axis=-1) / (
        d_norm * up_norm
    )

    sin_elevation = np.clip(sin_elevation, -1.0, 1.0)

    return np.degrees(np.arcsin(sin_elevation))


def trace_ray(
    observer_lat,
    observer_lon,
    observer_height_m,
    azimuth_deg,
    max_range_m,
    step_m,
    terrain_height_fn
):
    """
    Trace one azimuth across the lunar surface.

    terrain_height_fn(lat, lon) must return terrain height
    in meters above the lunar reference sphere.

    observer_height_m is the observer's height above local terrain.

    Returns the elevation angles and maximum horizon angle.
    """

    if max_range_m <= 0 or step_m <= 0:
        raise ValueError("Range and step must be positive")

    # Generate sample distances without exceeding max_range.
    distances = np.arange(step_m, max_range_m, step_m)

    # Include the exact maximum range if necessary.
    if len(distances) == 0 or distances[-1] < max_range_m:
        distances = np.append(distances, max_range_m)

    # Observer's terrain elevation.
    obs_ground_h = float(
        terrain_height_fn(observer_lat, observer_lon)
    )

    # Local up direction.
    up = unit_vector(observer_lat, observer_lon)

    # Observer's Moon-centered position.
    observer_pos = (
        MOON_RADIUS_M + obs_ground_h + observer_height_m
    ) * up

    # Calculate coordinates along the great-circle path.
    ray_lats, ray_lons = destination(
        observer_lat,
        observer_lon,
        azimuth_deg,
        distances,
        MOON_RADIUS_M
    )

    # Sample terrain elevation.
    terrain_heights = np.array([
        terrain_height_fn(lat, lon)
        for lat, lon in zip(ray_lats, ray_lons)
    ], dtype=float)

    if not np.all(np.isfinite(terrain_heights)):
        raise ValueError("Terrain samples contain invalid heights")

    # Convert all terrain samples into Moon-centered positions.
    terrain_directions = unit_vector(ray_lats, ray_lons)

    terrain_positions = (
        MOON_RADIUS_M + terrain_heights[:, None]
    ) * terrain_directions

    # Calculate elevation angle for every terrain sample.
    elevations = elevation_angle(
        observer_pos,
        terrain_positions,
        up
    )

    # Find the highest apparent terrain point.
    max_idx = np.argmax(elevations)

    return {
        "distances": distances,
        "latitudes": ray_lats,
        "longitudes": ray_lons,
        "terrain_heights": terrain_heights,
        "elevation_angles": elevations,
        "max_elevation_deg": elevations[max_idx],
        "max_elevation_distance_m": distances[max_idx]
    }


def mountain_terrain(lat, lon):

    distance = great_circle_distance(
        lat, lon,
        peak_lat, peak_lon,
        MOON_RADIUS_M
    )

    height = 500
    width = 1000

    return height * np.exp(
        -(distance ** 2) / (2 * width ** 2)
    )

def compute_horizon(
    observer_lat,
    observer_lon,
    observer_height_m,
    az_step_deg,
    max_range_m,
    step_m,
    terrain_height_fn
):
    if az_step_deg <= 0 or az_step_deg > 360:
        raise ValueError("Invalid azimuth step")

    azimuths = np.arange(0, 360, az_step_deg)
    elevations = []

    for azimuth in azimuths:
        result = trace_ray(
            observer_lat,
            observer_lon,
            observer_height_m,
            azimuth,
            max_range_m,
            step_m,
            terrain_height_fn
        )

        elevations.append(result["max_elevation_deg"])

    return {
        "az_deg": azimuths,
        "elev_deg": np.array(elevations)
    }

def great_circle_distance(lat1, lon1, lat2, lon2, radius):
    lat1, lon1 = np.radians(lat1), np.radians(lon1)
    lat2, lon2 = np.radians(lat2), np.radians(lon2)

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = (
        np.sin(dlat / 2) ** 2
        + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    )

    return 2 * radius * np.arcsin(np.sqrt(np.clip(a, 0, 1)))

peak_lat, peak_lon = destination(
    0, 0, 73.3, 10000, MOON_RADIUS_M
)

profile = compute_horizon(
    observer_lat=0,
    observer_lon=0,
    observer_height_m=0,
    az_step_deg=1,
    max_range_m=20000,
    step_m=100,
    terrain_height_fn=mountain_terrain
)

max_idx = np.argmax(profile["elev_deg"])

print("Best azimuth:", profile["az_deg"][max_idx])
print("Maximum elevation:", profile["elev_deg"][max_idx])
