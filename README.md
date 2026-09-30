# LED Wall Focus Planner

A simple, dependency-free web tool that shows how **field of view** and **depth of field** interact with an **LED volume wall**, and warns you when the wall itself falls into focus. When the wall is in focus, its pixel grid and seams show up and moiré becomes likely.

## Using it

Open `index.html` in a browser. There is no build step and no dependencies. It also works as-is on GitHub Pages: set **Settings → Pages → Deploy from branch** to the repo root.

- **Top view** shows the camera, the subject (a person), the horizontal FOV, the DOF band, the focus plane and the near, far and hyperfocal points. Drag the camera or the subject to move them.
- **Side view** is a vertical slice along the camera's line of sight. Drag the camera to change the lens height, or drag the aim point to change where on the subject the camera points.
- **LED wall:** width, height and bottom-edge height.
- **Camera:** camera body presets set the sensor size, or you can enter a custom sensor size. You can also set the camera position and lens height.
- **Lens and focus:** focal length, aperture (third stops f/1–f/22) and focus distance. Focus can follow the subject, or you can set it by hand. The circle of confusion is calculated automatically (sensor diagonal ÷ 1500), or you can enter your own.
- **Hazard stripes** appear on every part of the wall that is both in frame and inside the depth of field. The header banner also turns into a hazard warning.
- **Guidance** tells you which aperture would bring the wall into focus, or which aperture would throw it out of focus. It also tells you the furthest you can focus before the wall sharpens.
- The whole scene is saved in the URL, so you can share a set-up by copying the link.

## How it works

- Thin-lens DOF: `H = f²/(N·c) + f`, `near = s(H−f)/(H+s−2f)`, `far = s(H−f)/(H−s)` (∞ when `s ≥ H`).
- The wall face is sampled on a grid. For each sample point, the tool checks whether it is inside the camera frustum. It then compares the point's depth along the lens axis with the near and far limits. The focus plane is perpendicular to the lens axis, so a panned camera sees one side of the wall closer than the other.

## Roadmap

- Wall curvature (the wall geometry is isolated in `wallPoint()` in `app.js`).
- Moiré prediction from LED pixel pitch, sensor photosite size and defocus blur.
