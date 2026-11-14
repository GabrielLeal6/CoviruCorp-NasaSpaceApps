const DEM_URL = new URL("../moon/LDEM_4_FLOAT.IMG", import.meta.url);
const TEXTURE_URL = new URL("../moon/moon-global.png", import.meta.url);
const DEM_WIDTH = 1440;
const DEM_HEIGHT = 720;
const DEM_PIXELS_PER_DEGREE = 4;
const REFERENCE_RADIUS_KM = 1737.4;
const TERRAIN_EXAGGERATION = 8;
const LATITUDE_SEGMENTS = 360;
const LONGITUDE_SEGMENTS = 720;
export const LUNAR_TEXTURE_CROP = Object.freeze({
  x: 36,
  y: 46,
  width: 1470,
  height: 735,
});

const vertexShaderSource = `#version 300 es
in vec3 aPosition;
in vec3 aNormal;
in vec2 aTextureCoordinate;
in vec3 aColor;

uniform mat3 uRotation;
uniform float uDistance;
uniform float uAspect;
uniform float uPointSize;

out vec3 vNormal;
out vec2 vTextureCoordinate;
out vec3 vColor;

void main() {
  vec3 rotatedPosition = uRotation * aPosition;
  vNormal = normalize(uRotation * aNormal);
  vTextureCoordinate = aTextureCoordinate;
  vColor = aColor;

  float nearPlane = 0.1;
  float farPlane = 10.0;
  vec4 viewPosition = vec4(rotatedPosition.xy, rotatedPosition.z - uDistance, 1.0);
  float focalLength = 1.0 / tan(radians(40.0) * 0.5);
  float clipZ =
    ((farPlane + nearPlane) / (nearPlane - farPlane)) * viewPosition.z +
    (2.0 * farPlane * nearPlane) / (nearPlane - farPlane);
  gl_Position = vec4(
    viewPosition.x * focalLength / uAspect,
    viewPosition.y * focalLength,
    clipZ,
    -viewPosition.z
  );
  gl_PointSize = uPointSize;
}`;

const fragmentShaderSource = `#version 300 es
precision highp float;

uniform sampler2D uSurfaceTexture;
uniform bool uDrawMarkers;

in vec3 vNormal;
in vec2 vTextureCoordinate;
in vec3 vColor;
out vec4 fragmentColor;

void main() {
  if (uDrawMarkers) {
    vec2 point = gl_PointCoord - vec2(0.5);
    float distanceFromCenter = dot(point, point);
    if (distanceFromCenter > 0.25) discard;
    fragmentColor = distanceFromCenter > 0.15
      ? vec4(1.0, 0.96, 0.82, 1.0)
      : vec4(vColor, 1.0);
    return;
  }

  vec3 surfaceColor = texture(uSurfaceTexture, vTextureCoordinate).rgb;
  vec3 lightDirection = normalize(vec3(-0.45, 0.55, 1.0));
  float diffuse = max(dot(normalize(vNormal), lightDirection), 0.0);
  fragmentColor = vec4(surfaceColor * (0.72 + 0.38 * diffuse), 1.0);
}`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("WebGL could not allocate a lunar globe shader.");

  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Unknown shader compilation error.";
    gl.deleteShader(shader);
    throw new Error(`Could not compile the lunar globe shader: ${message}`);
  }
  return shader;
}

function createProgram(gl) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
  const program = gl.createProgram();
  if (!program) throw new Error("WebGL could not allocate the lunar globe program.");

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "Unknown program linking error.";
    gl.deleteProgram(program);
    throw new Error(`Could not link the lunar globe shaders: ${message}`);
  }
  return program;
}

async function loadDem() {
  const response = await fetch(DEM_URL);
  if (!response.ok) {
    throw new Error(`Could not load the LOLA elevation data (HTTP ${response.status}).`);
  }

  const buffer = await response.arrayBuffer();
  const expectedBytes = DEM_WIDTH * DEM_HEIGHT * Float32Array.BYTES_PER_ELEMENT;
  if (buffer.byteLength !== expectedBytes) {
    throw new Error(
      `The LOLA elevation file has ${buffer.byteLength} bytes; expected ${expectedBytes}.`,
    );
  }

  const littleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
  const heights = new Float32Array(DEM_WIDTH * DEM_HEIGHT);
  const view = new DataView(buffer);
  const littleEndianHeights = littleEndian ? new Float32Array(buffer) : null;
  let minimum = Infinity;
  let maximum = -Infinity;

  for (let index = 0; index < heights.length; index += 1) {
    const height = littleEndianHeights
      ? littleEndianHeights[index]
      : view.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true);
    if (!Number.isFinite(height)) {
      throw new Error(`The LOLA elevation file contains an invalid value at sample ${index}.`);
    }
    heights[index] = height;
    minimum = Math.min(minimum, height);
    maximum = Math.max(maximum, height);
  }

  if (minimum > -8.8 || maximum < 10.4) {
    throw new Error(
      `The LOLA elevation range (${minimum.toFixed(3)} to ${maximum.toFixed(3)} km) does not match the PDS label.`,
    );
  }
  return heights;
}

async function loadTexture(gl) {
  const image = new Image();
  image.src = TEXTURE_URL.href;
  await image.decode();

  const { x, y, width, height } = LUNAR_TEXTURE_CROP;
  if (image.naturalWidth < x + width || image.naturalHeight < y + height) {
    throw new Error("The lunar texture is smaller than the georeferenced map crop.");
  }

  const cropped = document.createElement("canvas");
  cropped.width = width;
  cropped.height = height;
  const context = cropped.getContext("2d");
  if (!context) throw new Error("Could not prepare the lunar surface texture.");
  context.drawImage(image, x, y, width, height, 0, 0, width, height);

  const texture = gl.createTexture();
  if (!texture) throw new Error("WebGL could not allocate the lunar surface texture.");
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cropped);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.generateMipmap(gl.TEXTURE_2D);
  return texture;
}

function sampleHeight(heights, latitude, longitude) {
  const row = Math.min(
    DEM_HEIGHT - 1,
    Math.max(0, (89.875 - latitude) * DEM_PIXELS_PER_DEGREE),
  );
  const longitude360 = ((longitude % 360) + 360) % 360;
  const column = (((longitude360 - 0.125) * DEM_PIXELS_PER_DEGREE) % DEM_WIDTH + DEM_WIDTH) % DEM_WIDTH;
  const row0 = Math.floor(row);
  const row1 = Math.min(DEM_HEIGHT - 1, row0 + 1);
  const column0 = Math.floor(column);
  const column1 = (column0 + 1) % DEM_WIDTH;
  const rowFraction = row - row0;
  const columnFraction = column - column0;
  const upper = heights[row0 * DEM_WIDTH + column0] * (1 - columnFraction) +
    heights[row0 * DEM_WIDTH + column1] * columnFraction;
  const lower = heights[row1 * DEM_WIDTH + column0] * (1 - columnFraction) +
    heights[row1 * DEM_WIDTH + column1] * columnFraction;
  return upper * (1 - rowFraction) + lower * rowFraction;
}

function maximumMeshHeightAt(heights, latitude, longitude) {
  const latitudeIndex = Math.min(
    LATITUDE_SEGMENTS,
    Math.max(0, Math.floor((latitude + 90) / (180 / LATITUDE_SEGMENTS))),
  );
  const longitude360 = ((longitude + 180) % 360 + 360) % 360;
  const longitudeIndex = Math.floor(
    longitude360 / (360 / LONGITUDE_SEGMENTS),
  );
  const latitude0 = -90 + latitudeIndex * (180 / LATITUDE_SEGMENTS);
  const latitude1 = Math.min(
    90,
    latitude0 + 180 / LATITUDE_SEGMENTS,
  );
  const longitude0 = -180 + longitudeIndex * (360 / LONGITUDE_SEGMENTS);
  const longitude1 = longitude0 + 360 / LONGITUDE_SEGMENTS;

  return Math.max(
    sampleHeight(heights, latitude0, longitude0),
    sampleHeight(heights, latitude0, longitude1),
    sampleHeight(heights, latitude1, longitude0),
    sampleHeight(heights, latitude1, longitude1),
  );
}

function normalize(x, y, z) {
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

function multiplyQuaternions(left, right) {
  const [x1, y1, z1, w1] = left;
  const [x2, y2, z2, w2] = right;
  return [
    w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
    w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
    w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
    w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
  ];
}

function axisAngleQuaternion(axisX, axisY, axisZ, angle) {
  const halfAngle = angle / 2;
  const sine = Math.sin(halfAngle);
  return [axisX * sine, axisY * sine, axisZ * sine, Math.cos(halfAngle)];
}

function normalizeQuaternion(quaternion) {
  const length = Math.hypot(...quaternion);
  return quaternion.map((component) => component / length);
}

function rotationMatrix(quaternion) {
  const [x, y, z, w] = quaternion;
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const xw = x * w;
  const yw = y * w;
  const zw = z * w;
  return new Float32Array([
    1 - 2 * (yy + zz),
    2 * (xy + zw),
    2 * (xz - yw),
    2 * (xy - zw),
    1 - 2 * (xx + zz),
    2 * (yz + xw),
    2 * (xz + yw),
    2 * (yz - xw),
    1 - 2 * (xx + yy),
  ]);
}

function rotateVector(vector, quaternion) {
  const [x, y, z, w] = quaternion;
  const crossX = y * vector[2] - z * vector[1];
  const crossY = z * vector[0] - x * vector[2];
  const crossZ = x * vector[1] - y * vector[0];
  const doubleCrossX = y * crossZ - z * crossY;
  const doubleCrossY = z * crossX - x * crossZ;
  const doubleCrossZ = x * crossY - y * crossX;
  return [
    vector[0] + 2 * (w * crossX + doubleCrossX),
    vector[1] + 2 * (w * crossY + doubleCrossY),
    vector[2] + 2 * (w * crossZ + doubleCrossZ),
  ];
}

function rotateViewToModel(vector, rotation) {
  return rotateVector(vector, [-rotation[0], -rotation[1], -rotation[2], rotation[3]]);
}

function intersectSphere(origin, direction, radius) {
  const projection =
    origin[0] * direction[0] +
    origin[1] * direction[1] +
    origin[2] * direction[2];
  const offset =
    origin[0] * origin[0] +
    origin[1] * origin[1] +
    origin[2] * origin[2] -
    radius * radius;
  const discriminant = projection * projection - offset;
  if (discriminant < 0) return null;

  const distance = -projection - Math.sqrt(discriminant);
  return distance >= 0 ? distance : null;
}

function createTerrain(heights) {
  const rowLength = LONGITUDE_SEGMENTS + 1;
  const vertexCount = (LATITUDE_SEGMENTS + 1) * rowLength;
  const vertices = new Float32Array(vertexCount * 8);
  const indices = new Uint32Array(LATITUDE_SEGMENTS * LONGITUDE_SEGMENTS * 6);
  const latitudeStep = 180 / LATITUDE_SEGMENTS;
  const longitudeStep = 360 / LONGITUDE_SEGMENTS;

  for (let row = 0; row <= LATITUDE_SEGMENTS; row += 1) {
    const latitude = -90 + row * latitudeStep;
    const latitudeRadians = (latitude * Math.PI) / 180;
    const cosLatitude = Math.cos(latitudeRadians);
    const sinLatitude = Math.sin(latitudeRadians);

    for (let column = 0; column <= LONGITUDE_SEGMENTS; column += 1) {
      const longitude = -180 + column * longitudeStep;
      const longitudeRadians = (longitude * Math.PI) / 180;
      const cosLongitude = Math.cos(longitudeRadians);
      const sinLongitude = Math.sin(longitudeRadians);
      const heightKm = sampleHeight(heights, latitude, longitude);
      const radius =
        1 + (heightKm / REFERENCE_RADIUS_KM) * TERRAIN_EXAGGERATION;
      const position = [
        radius * cosLatitude * sinLongitude,
        radius * sinLatitude,
        radius * cosLatitude * cosLongitude,
      ];

      const latitudeDelta = (latitudeStep * Math.PI) / 360;
      const longitudeDelta = (longitudeStep * Math.PI) / 360;
      const latitudeSlope =
        ((sampleHeight(heights, Math.min(90, latitude + latitudeStep / 2), longitude) -
          sampleHeight(heights, Math.max(-90, latitude - latitudeStep / 2), longitude)) *
          TERRAIN_EXAGGERATION /
          REFERENCE_RADIUS_KM) /
        (2 * latitudeDelta);
      const longitudeSlope =
        ((sampleHeight(heights, latitude, longitude + longitudeStep / 2) -
          sampleHeight(heights, latitude, longitude - longitudeStep / 2)) *
          TERRAIN_EXAGGERATION /
          REFERENCE_RADIUS_KM) /
        (2 * longitudeDelta);

      let normalX = cosLatitude * sinLongitude -
        (latitudeSlope / radius) * -sinLatitude * sinLongitude;
      let normalY = sinLatitude - (latitudeSlope / radius) * cosLatitude;
      let normalZ = cosLatitude * cosLongitude -
        (latitudeSlope / radius) * -sinLatitude * cosLongitude;
      if (Math.abs(cosLatitude) > 0.001) {
        normalX -= (longitudeSlope / (radius * cosLatitude)) * cosLongitude;
        normalZ -= (longitudeSlope / (radius * cosLatitude)) * -sinLongitude;
      }
      const normal = normalize(normalX, normalY, normalZ);

      const offset = (row * rowLength + column) * 8;
      vertices[offset] = position[0];
      vertices[offset + 1] = position[1];
      vertices[offset + 2] = position[2];
      vertices[offset + 3] = normal[0];
      vertices[offset + 4] = normal[1];
      vertices[offset + 5] = normal[2];
      vertices[offset + 6] = column / LONGITUDE_SEGMENTS;
      vertices[offset + 7] = row / LATITUDE_SEGMENTS;
    }
  }

  let indexOffset = 0;
  for (let row = 0; row < LATITUDE_SEGMENTS; row += 1) {
    for (let column = 0; column < LONGITUDE_SEGMENTS; column += 1) {
      const topLeft = row * rowLength + column;
      const bottomLeft = topLeft + rowLength;
      indices[indexOffset++] = topLeft;
      indices[indexOffset++] = bottomLeft;
      indices[indexOffset++] = topLeft + 1;
      indices[indexOffset++] = topLeft + 1;
      indices[indexOffset++] = bottomLeft;
      indices[indexOffset++] = bottomLeft + 1;
    }
  }
  return { vertices, indices };
}

function parseColor(color) {
  if (typeof color !== "string" || !/^#[\da-f]{6}$/i.test(color)) {
    throw new TypeError("A lunar globe location must use a six-digit hex color.");
  }
  return [
    Number.parseInt(color.slice(1, 3), 16) / 255,
    Number.parseInt(color.slice(3, 5), 16) / 255,
    Number.parseInt(color.slice(5, 7), 16) / 255,
  ];
}

export async function createLunarGlobe(canvas) {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false });
  if (!gl) {
    throw new Error("This browser does not support WebGL 2, required for the 3D lunar terrain.");
  }

  const [heights, texture] = await Promise.all([loadDem(), loadTexture(gl)]);
  const terrain = createTerrain(heights);
  const program = createProgram(gl);
  const vertexBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();
  const markerBuffer = gl.createBuffer();
  if (!vertexBuffer || !indexBuffer || !markerBuffer) {
    throw new Error("WebGL could not allocate the lunar terrain buffers.");
  }

  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, terrain.vertices, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, terrain.indices, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, markerBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, 0, gl.DYNAMIC_DRAW);
  gl.useProgram(program);

  const attributes = {
    position: gl.getAttribLocation(program, "aPosition"),
    normal: gl.getAttribLocation(program, "aNormal"),
    textureCoordinate: gl.getAttribLocation(program, "aTextureCoordinate"),
    color: gl.getAttribLocation(program, "aColor"),
  };
  const uniforms = {
    rotation: gl.getUniformLocation(program, "uRotation"),
    distance: gl.getUniformLocation(program, "uDistance"),
    aspect: gl.getUniformLocation(program, "uAspect"),
    pointSize: gl.getUniformLocation(program, "uPointSize"),
    drawMarkers: gl.getUniformLocation(program, "uDrawMarkers"),
    surfaceTexture: gl.getUniformLocation(program, "uSurfaceTexture"),
  };

  let rotation = axisAngleQuaternion(1, 0, 0, -1.2);
  let distance = 3.25;
  let pointer = null;
  let lastPointerDragged = false;
  let markerCount = 0;

  function bindVertexAttributes(buffer, isMarkerBuffer = false) {
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const stride = (isMarkerBuffer ? 11 : 8) * Float32Array.BYTES_PER_ELEMENT;
    gl.enableVertexAttribArray(attributes.position);
    gl.vertexAttribPointer(attributes.position, 3, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(attributes.normal);
    gl.vertexAttribPointer(attributes.normal, 3, gl.FLOAT, false, stride, 3 * 4);
    gl.enableVertexAttribArray(attributes.textureCoordinate);
    gl.vertexAttribPointer(attributes.textureCoordinate, 2, gl.FLOAT, false, stride, 6 * 4);
    if (isMarkerBuffer) {
      gl.enableVertexAttribArray(attributes.color);
      gl.vertexAttribPointer(attributes.color, 3, gl.FLOAT, false, stride, 8 * 4);
    } else {
      gl.disableVertexAttribArray(attributes.color);
      gl.vertexAttrib3f(attributes.color, 1, 1, 1);
    }
  }

  function draw() {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(canvas.clientWidth * pixelRatio));
    const height = Math.max(1, Math.round(canvas.clientHeight * pixelRatio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    gl.clearColor(0.035, 0.065, 0.11, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.useProgram(program);
    gl.uniformMatrix3fv(uniforms.rotation, false, rotationMatrix(rotation));
    gl.uniform1f(uniforms.distance, distance);
    gl.uniform1f(uniforms.aspect, width / height);
    gl.uniform1f(
      uniforms.pointSize,
      Math.min(18 * pixelRatio, gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1]),
    );
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uniforms.surfaceTexture, 0);
    gl.uniform1i(uniforms.drawMarkers, 0);
    bindVertexAttributes(vertexBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.drawElements(gl.TRIANGLES, terrain.indices.length, gl.UNSIGNED_INT, 0);

    if (markerCount > 0) {
      gl.uniform1i(uniforms.drawMarkers, 1);
      bindVertexAttributes(markerBuffer, true);
      gl.drawArrays(gl.POINTS, 0, markerCount);
    }
  }

  const resizeObserver = new ResizeObserver(draw);
  resizeObserver.observe(canvas);
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    pointer = {
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    lastPointerDragged = false;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!pointer) return;
    const deltaX = event.clientX - pointer.x;
    const deltaY = event.clientY - pointer.y;
    if (
      Math.abs(event.clientX - pointer.startX) > 3 ||
      Math.abs(event.clientY - pointer.startY) > 3
    ) {
      pointer.moved = true;
    }
    // Camera-space rotation keeps vertical drag direction consistent across the globe.
    const horizontalRotation = axisAngleQuaternion(0, 1, 0, deltaX * 0.008);
    const verticalRotation = axisAngleQuaternion(1, 0, 0, deltaY * 0.008);
    rotation = normalizeQuaternion(
      multiplyQuaternions(
        verticalRotation,
        multiplyQuaternions(horizontalRotation, rotation),
      ),
    );
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    draw();
  });
  const finishRotation = () => {
    if (pointer) lastPointerDragged = pointer.moved;
    pointer = null;
  };
  canvas.addEventListener("pointerup", finishRotation);
  canvas.addEventListener("pointercancel", () => {
    pointer = null;
    lastPointerDragged = true;
  });
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      distance = Math.max(1.8, Math.min(6, distance * Math.exp(event.deltaY * 0.001)));
      draw();
    },
    { passive: false },
  );

  function pickCoordinates(clientX, clientY) {
    if (lastPointerDragged) {
      lastPointerDragged = false;
      return undefined;
    }

    const bounds = canvas.getBoundingClientRect();
    const normalizedX = ((clientX - bounds.left) / bounds.width) * 2 - 1;
    const normalizedY = 1 - ((clientY - bounds.top) / bounds.height) * 2;
    const focalLength = 1 / Math.tan((40 * Math.PI) / 360);
    const viewDirection = normalize(
      normalizedX * (bounds.width / bounds.height) / focalLength,
      normalizedY / focalLength,
      -1,
    );
    const origin = rotateViewToModel([0, 0, distance], rotation);
    const direction = normalize(
      ...rotateViewToModel(viewDirection, rotation),
    );
    let rayDistance = intersectSphere(origin, direction, 1.05);
    if (rayDistance === null) return null;

    for (let iteration = 0; iteration < 6; iteration += 1) {
      const point = [
        origin[0] + direction[0] * rayDistance,
        origin[1] + direction[1] * rayDistance,
        origin[2] + direction[2] * rayDistance,
      ];
      const pointRadius = Math.hypot(...point);
      const latitude = (Math.asin(point[1] / pointRadius) * 180) / Math.PI;
      const longitude = (Math.atan2(point[0], point[2]) * 180) / Math.PI;
      const surfaceRadius =
        1 +
        (sampleHeight(heights, latitude, longitude) / REFERENCE_RADIUS_KM) *
          TERRAIN_EXAGGERATION;
      const nextDistance = intersectSphere(origin, direction, surfaceRadius);
      if (nextDistance === null) return null;
      if (Math.abs(nextDistance - rayDistance) < 1e-5) {
        rayDistance = nextDistance;
        break;
      }
      rayDistance = nextDistance;
    }

    const point = [
      origin[0] + direction[0] * rayDistance,
      origin[1] + direction[1] * rayDistance,
      origin[2] + direction[2] * rayDistance,
    ];
    const pointRadius = Math.hypot(...point);
    const latitude = (Math.asin(point[1] / pointRadius) * 180) / Math.PI;
    const longitude = (Math.atan2(point[0], point[2]) * 180) / Math.PI;
    return {
      latitude,
      longitude: ((longitude + 180) % 360 + 360) % 360 - 180,
    };
  }

  function setLocations(locations) {
    const markerVertices = new Float32Array(locations.length * 11);
    locations.forEach((location, index) => {
      const latitude = location.latitude;
      const longitude = location.longitude;
      const latitudeRadians = (latitude * Math.PI) / 180;
      const longitudeRadians = (longitude * Math.PI) / 180;
      const cosLatitude = Math.cos(latitudeRadians);
      const heightKm = maximumMeshHeightAt(heights, latitude, longitude);
      const radius =
        1 + (heightKm / REFERENCE_RADIUS_KM) * TERRAIN_EXAGGERATION + 0.003;
      const offset = index * 11;
      markerVertices[offset] = radius * cosLatitude * Math.sin(longitudeRadians);
      markerVertices[offset + 1] = radius * Math.sin(latitudeRadians);
      markerVertices[offset + 2] = radius * cosLatitude * Math.cos(longitudeRadians);
      markerVertices[offset + 3] = markerVertices[offset];
      markerVertices[offset + 4] = markerVertices[offset + 1];
      markerVertices[offset + 5] = markerVertices[offset + 2];
      markerVertices[offset + 6] = 0;
      markerVertices[offset + 7] = 0;
      markerVertices.set(parseColor(location.color), offset + 8);
    });

    gl.bindBuffer(gl.ARRAY_BUFFER, markerBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, markerVertices, gl.DYNAMIC_DRAW);
    markerCount = locations.length;
    draw();
  }

  draw();
  return {
    setLocations,
    pickCoordinates,
    destroy: () => resizeObserver.disconnect(),
  };
}
