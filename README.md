# CoviruCorp-NasaSpaceApps

## Run locally

Install the dependencies and start the API and frontend on the same server:

```bash
poetry install
poetry run uvicorn --app-dir src lunarnav.api.main:app --reload --host 0.0.0.0 --port 8000
```

Open <http://localhost:8000/> to access the website and <http://localhost:8000/docs> to explore the API.

## Explore the lunar terrain in 3D

On the map page, select **3D terrain** to view the global LOLA elevation model with the existing lunar image as its surface texture. The 3D view uses the same georeferenced image crop as the 2D map and samples the PDS elevation grid using its 4-pixels-per-degree simple cylindrical coordinates. The elevation values are kilometers above the 1,737.4 km reference sphere.

Drag to rotate and scroll to zoom. To choose a new location, select **Add new location** > **Select on map**, then click the visible lunar surface in either view; dragging in 3D rotates the globe instead of selecting a point. The source DEM is about 7.58 km per pixel and is sampled onto a 0.5-degree display mesh. Terrain relief is exaggerated by 8x for visibility, so this global model is for visualization rather than fine-scale site analysis. The browser must support WebGL 2. All assets are loaded from the local application.