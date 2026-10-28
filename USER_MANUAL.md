# ROS View — User Manual

> **Simplified Chinese:** [USER_MANUAL.zh.md](USER_MANUAL.zh.md)

---

## English

### 1. Loading Data

#### 1.1 Open a local file

Click **"Open ROS File"** on the welcome screen, or drag and drop a `.mcap`, `.bag`, `.db3`, `.h5/.hdf5`, or `.bvh` file anywhere onto the window. Multiple files can be dropped at once.

#### 1.2 Open a local directory

Click **"Open Directory"** to select a folder. ROS View will scan for all supported recording files inside it and list them in the **Data** sidebar tab.

#### 1.3 Load a remote file

Paste a URL into the remote URL input on the welcome screen, or use the URL parameter:

```
https://rosview.com?url=https://your-server.com/recording.mcap
```

The remote server must support HTTP `Range` requests and CORS headers. Large files start playing immediately without waiting for the full download.

#### 1.4 Load a file manifest

To show a switchable list of remote recordings from a JSON manifest, embed ROS View in your own page and pass the `fileManifest` prop (manifest URL string or parsed rows). The public **rosview.com** standalone SPA tracks a single `?url=` in the address bar and does not load manifests from query parameters.

Manifest format:

```json
[
  { "url": "https://cdn.example.com/run1.mcap", "name": "Run 1", "durationSec": 120 },
  { "url": "https://cdn.example.com/run2.mcap", "name": "Run 2" }
]
```

---

### 2. Interface Layout

#### 2.1 Panel management

- **Drag**: Click a panel tab and drag to rearrange or dock panels side by side.
- **Close**: Click the **×** button on a tab to close a panel.
- **Auto-layout**: On file load, ROS View auto-generates an optimal layout based on detected topics.
- **Split**: Drag a panel tab to the edge of another panel to split the view.

#### 2.2 Sidebar tabs

| Tab | Description |
|-----|-------------|
| **Topics** | Lists all topics in the recording — name, message type, frequency, message count. Click a topic to add the appropriate panel. |
| **Data** | Lists loaded files/datasets. Click to switch the active recording. |
| **Annotations** | Manage interval labels and markers for data review workflows. |

#### 2.3 Customising the layout

Use the **navbar layout menu** (top-right) to:

- Export the current panel arrangement as a JSON layout file
- Import a previously saved layout
- Import a layout from Foxglove Studio

---

### 3. Playback Controls

#### 3.1 Timeline

Click anywhere on the timeline to seek to that point. The semi-transparent region shows data that has already been buffered (relevant for remote files).

#### 3.2 Playback speed

Use the speed selector on the right of the playback bar: `0.1×` `0.25×` `0.5×` `1×` `2×` `4×` `8×` or **Max**.

#### 3.3 Step controls

Use the step buttons (or keyboard arrows) to advance or rewind one frame at a time.

---

### 4. Annotation System

Open the **Annotations** sidebar tab to use the built-in interval labeling workflow.

- **Create interval**: Drag on the timeline to mark a time range, then fill in the label form.
- **Mark current time**: Click **"Add Marker"** to tag the current playback position.
- **Jump to annotation**: Click any entry in the annotation list to seek to that point.
- **Export**: Click **"Export"** to download all annotations as a JSON file compatible with data pipelines.
- **Import**: Load previously exported annotations or annotations from an external tool.

---

### 5. Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `←` / `→` | Step backward / forward one frame |
| `[` / `]` | Decrease / increase playback speed |
| `Home` | Jump to start |
| `End` | Jump to end |

---

### 6. Troubleshooting

| Symptom | Solution |
|---------|----------|
| **File fails to load** | Check that the file format is supported (`.mcap`, `.bag`, `.db3`, `.h5`, `.bvh`). For remote files, ensure the server returns CORS headers and supports `Range` requests (`Accept-Ranges: bytes`). |
| **Playback stutters** | Close panels you are not actively using. Reduce the number of subscribed topics in the Plot panel. |
| **3D view is empty** | Ensure the `/tf` or `/tf_static` topic is present in the recording and the 3D panel is subscribed to it. |
| **WASM decoders fail** | Some browsers block `SharedArrayBuffer` without the correct COOP/COEP headers. Host the SPA with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless`. |
| **Remote file starts slowly** | The server may not support `Range` requests — the full file must be downloaded before playback can start. Check the server's `Accept-Ranges` response header. |

---

### 7. Plot Field Paths

A Plot series path selects numeric fields (`position[:]`, `motor_state_serial[:].q`, `imu_state.rpy[0]`) and may end with `@` modifiers applied in order:

| Modifier | Effect |
|----------|--------|
| `@derivative` | Rate of change between consecutive messages |
| `@abs`, `@rad2deg`, `@deg2rad`, `@sqrt`, … | Per-value math functions |
| `@sub(<path>)` | Subtract another field of the same message, e.g. `msgpack.retarget_done_ns@sub(msgpack.body_recv_ns)` |
| `@ns2ms` | Nanoseconds → milliseconds (the Y axis is labelled `ms`) |

`$receive_ns` is the message receive (log) time in nanoseconds, so `$receive_ns@sub(msgpack.source_ns)@ns2ms` plots how long a wall-clock-stamped sample took to reach the recorder. For `std_msgs/ByteMultiArray` topics whose payload is msgpack, the field picker offers these pipeline latency curves automatically, pairing only stamps from the same clock.
