# SynapseRack Node Catalog

Generated from the live node registry (do not edit by hand — regenerate via
**SynapseRack > Synapse Apps > Generate Node Catalog**). This lists every node type
`synapse.modules` can create, its ports, and its settable members.

## How to use

- **Create** a node: `await synapse.modules.create({ type: "<id>" })` — use the **id** from
  the tables below. The call returns the module's `{ id }` (its moduleId).
- **Set** a member: `await synapse.modules.set(moduleId, "<path>", value)` — `<path>` is a
  settable path from the node's row. Value type is shown next to the path.
- **Connect** ports: `await synapse.modules.connect({ fromModuleId, fromPort, toModuleId, toPort })`
  — `fromPort`/`toPort` are the port **ids** in the in/out summary.
- **Bind** a continuous float source to a node member: target `{ moduleId, path }`, where
  `path` is a settable path whose type is `float`.
- The exact same data is available at runtime via `await synapse.modules.types()`.

Port/settable notation: `id(type)`. A `type` that is a class name (not float/int/bool/
string/trigger) is a data type only carried on connections, not something you set directly.

## 3D

| id | title | inputs | outputs | settable |
| --- | --- | --- | --- | --- |
| `CirclePattern` | Circle | `Count`(int), `Radius`(float), `StartAngle`(float) | `Positions`(PositionBufferOutput) | — |
| `Cube3D` | Cube | `PosX`(float), `PosY`(float), `PosZ`(float), `RotX`(float), `RotY`(float), `RotZ`(float), `ScaleX`(float), `ScaleY`(float), `ScaleZ`(float), `Material`(MaterialInput) | `Mesh`(Mesh3DOutput) | — |
| `GridPattern` | Grid | `CountX`(int), `CountY`(int), `CountZ`(int), `SpacingX`(float), `SpacingY`(float), `SpacingZ`(float) | `Positions`(PositionBufferOutput) | — |
| `Instancer` | Instancer | `Source`(Mesh3DInput), `Positions`(PositionBufferInput), `Scale`(float), `Material`(MaterialInput) | `Instanced`(SceneObjectOutput) | — |
| `Scene3D` | Scene3D | `CamX`(float), `CamY`(float), `CamZ`(float), `RotX`(float), `RotY`(float), `RotZ`(float), `FOV`(float), `BGR`(float), `BGG`(float), `BGB`(float) | `Render`(RenderTexture) | `camPosX`(float), `camPosY`(float), `camPosZ`(float), `camRotX`(float), `camRotY`(float), `camRotZ`(float), `fov`(float), `bgR`(float), `bgG`(float), `bgB`(float) |
| `StandardMaterial` | StandardMaterial | `ColorR`(float), `ColorG`(float), `ColorB`(float), `Alpha`(float), `Metallic`(float), `Smoothness`(float), `Emission`(float), `Texture`(RenderTexture) | `Material`(MaterialOutput) | — |
| `UnlitMaterial` | UnlitMaterial | `ColorR`(float), `ColorG`(float), `ColorB`(float), `Alpha`(float), `Texture`(RenderTexture) | `Material`(MaterialOutput) | — |

## Group

| id | title | inputs | outputs | settable |
| --- | --- | --- | --- | --- |
| `Group` | Group | — | — | `groupName`(string) |
| `GroupInput` | Group In | — | `Out`(PassthroughWrapper) | `label`(string) |
| `GroupOutput` | Group Out | `In`(PassthroughWrapper) | — | `label`(string) |

## I/O

| id | title | inputs | outputs | settable |
| --- | --- | --- | --- | --- |
| `artnet_output` | ArtNet Output | `DMX In`(DMXFrame) | — | — |
| `AudioReactive` | AudioReactive | `Dynamic Range`(float), `Fall Speed`(float), `Auto Gain`(bool), `Gain`(float) | `Audio Level`(float) | `dynamicRangeInput`(float), `fallSpeedInput`(float), `autoGainInput`(bool), `gainInput`(float), `dynamicRange`(float), `fallSpeed`(float), `autoGain`(bool), `gain`(float), `currentDeviceID`(string), `currentAudioLevel`(float), `peakLevel`(float) |
| `artnet_test` | Debug | — | — | — |
| `LipSync` | LipSync | — | `Track Path`(string), `Position (sec)`(float), `Position (0-1)`(float), `Playback Speed`(float), `Confidence`(float), `Is Matched`(bool), `Profile ID`(string) | `currentDeviceID`(string), `analyzeFolderPath`(string), `matchProfileId`(string), `isListening`(bool), `isAnalyzing`(bool), `analysisProgress`(float), `statusText`(string), `matchedTrackPath`(string), `matchedPosition`(float), `matchedSpeed`(float), `matchedConfidence`(float), `isMatched`(bool), `matchedProfileId`(string) |
| `midi_led` | MIDI LED | `Color`(Color), `Note`(float), `Trig`(trigger) | — | `currentDeviceName`(string), `currentPresetName`(string), `currentChannel`(int), `currentNote`(int) |
| `midi_output` | MIDI Output | `Val`(float), `Trig`(trigger) | — | `currentDeviceName`(string), `currentChannel`(int), `currentNumber`(int) |
| `MediaOut` | MediaOut | `Render Texture`(RenderTexture) | — | `mediaName`(string) |
| `ofl_fixture` | OFL Fixture | `Pan (0-1)`(float), `Tilt (0-1)`(float), `Dimmer (0-1)`(float), `Color`(Color), `Zoom (0-1)`(float), `Strobe (0-1)`(float) | `DMX Out`(DMXFrame) | `panInput`(float), `tiltInput`(float), `dimmerInput`(float), `zoomInput`(float), `strobeInput`(float) |
| `OSCBoolInput` | OSCBoolInput | — | `Bool Output`(bool) | `currentOSCAddress`(string) |
| `OSCBoolOutput` | OSCBoolOutput | `In`(bool), `Trigger`(trigger) | — | `currentOSCAddress`(string) |
| `OSCFloatInput` | OSCFloatInput | — | `Float Output`(float) | `currentOSCAddress`(string) |
| `OSCFloatOutput` | OSCFloatOutput | `In`(float), `Trigger`(trigger) | — | `currentOSCAddress`(string) |
| `OSCIntInput` | OSCIntInput | — | `Int Output`(int) | `currentOSCAddress`(string) |
| `OSCIntOutput` | OSCIntOutput | `In`(int), `Trigger`(trigger) | — | `currentOSCAddress`(string) |
| `dmx_simulation_output` | Output | `DMX In`(DMXFrame) | — | — |
| `Shazam` | Shazam | — | `Song Title`(string), `Artist Name`(string), `Full Result (Title - Artist)`(string) | `currentTitle`(string), `currentArtist`(string), `status`(string) |
| `sysex_output` | SysEx Output | `Trig`(trigger) | — | `currentDeviceName`(string), `currentSysExHex`(string) |
| `dmx_universe` | Universe | `DMX 1`(DMXFrame), `DMX 2`(DMXFrame), `DMX 3`(DMXFrame), `DMX 4`(DMXFrame), `DMX 5`(DMXFrame), `DMX 6`(DMXFrame), `DMX 7`(DMXFrame), `DMX 8`(DMXFrame), `DMX 9`(DMXFrame), `DMX 10`(DMXFrame), `DMX 11`(DMXFrame), `DMX 12`(DMXFrame), `DMX 13`(DMXFrame), `DMX 14`(DMXFrame), `DMX 15`(DMXFrame), `DMX 16`(DMXFrame) | `DMX Out`(DMXFrame) | — |

## Layer

| id | title | inputs | outputs | settable |
| --- | --- | --- | --- | --- |
| `LayerFx` | LayerFx | `Enable`(bool) | — | `enableInput`(bool), `selectedLayerIndex`(int), `isOn`(bool) |
| `LayerInOut` | LayerInOut | `RenderTexture Input`(RenderTexture) | `RenderTexture Output`(RenderTexture) | `selectedIndex`(int), `selectedLayerGUID`(string) |
| `LayerOpacity` | LayerOpacity | `Opacity`(float) | `Opacity`(float) | `floatInput`(float), `currentOpacity`(float), `selectedLayerIndex`(int) |
| `LayerPosition` | LayerPosition | `Position X`(float), `Position Y`(float), `Position Z`(float) | `Position X`(float), `Position Y`(float), `Position Z`(float) | `inputX`(float), `inputY`(float), `inputZ`(float), `selectedLayerIndex`(int) |
| `LayerRectMask` | LayerRectMask | `Left`(float), `Right`(float), `Top`(float), `Bottom`(float), `Softness X`(float), `Softness Y`(float) | `Left`(float), `Right`(float), `Top`(float), `Bottom`(float), `Softness X`(float), `Softness Y`(float) | `inputLeft`(float), `inputRight`(float), `inputTop`(float), `inputBottom`(float), `inputSoftnessX`(float), `inputSoftnessY`(float), `selectedLayerIndex`(int) |
| `LayerRotation` | LayerRotation | `Rotation X`(float), `Rotation Y`(float), `Rotation Z`(float) | `Rotation X`(float), `Rotation Y`(float), `Rotation Z`(float) | `inputX`(float), `inputY`(float), `inputZ`(float), `selectedLayerIndex`(int) |
| `LayerScale` | LayerScale | `Scale X`(float), `Scale Y`(float) | `Scale X`(float), `Scale Y`(float) | `inputX`(float), `inputY`(float), `selectedLayerIndex`(int) |
| `LayerSeek` | LayerSeek | `Position`(float), `Seek Trigger`(trigger) | `Position`(float) | `floatInput`(float), `currentPosition`(float), `selectedLayerIndex`(int), `continuousSeek`(bool) |
| `LayerSpeed` | LayerSpeed | `Speed`(float) | `Speed`(float) | `floatInput`(float), `currentSpeed`(float), `selectedLayerIndex`(int) |
| `PathToLayerMedia` | PathToLayerMedia | `File Path`(string) | — | `filePathInput`(string), `selectedLayerIndex`(int), `lastFilePath`(string), `statusText`(string) |
| `LayerWaveform` | Waveform | — | — | `selectedLayerId`(string), `playbackPosition`(float), `duration`(float), `showLow`(bool), `showMid`(bool), `showHigh`(bool) |

## Math

| id | title | inputs | outputs | settable |
| --- | --- | --- | --- | --- |
| `abs` | Abs | `A`(float), `B`(float) | `Result`(float) | `currentValueA`(float), `currentValueB`(float) |
| `add` | Add | `A`(float), `B`(float) | `Result`(float) | `currentValueA`(float), `currentValueB`(float) |
| `ceil` | Ceil | `A`(float), `Trigger`(trigger) | `Result`(float) | `currentValueA`(float) |
| `divide` | Divide | `A`(float), `B`(float) | `Result`(float) | `currentValueA`(float), `currentValueB`(float) |
| `floor` | Floor | `A`(float), `Trigger`(trigger) | `Result`(float) | `currentValueA`(float) |
| `fract` | Fract | `A`(float), `Trigger`(trigger) | `Result`(float) | `currentValueA`(float) |
| `minus` | Minus | `A`(float), `B`(float) | `Result`(float) | `currentValueA`(float), `currentValueB`(float) |
| `modulo` | Modulo | `A`(float), `B`(float) | `Result`(float) | `currentValueA`(float), `currentValueB`(float) |
| `multiply` | Multiply | `A`(float), `B`(float) | `Result`(float) | `currentValueA`(float), `currentValueB`(float) |
| `pow` | Pow | `A`(float), `B`(float) | `Result`(float) | `currentValueA`(float), `currentValueB`(float) |
| `round` | Round | `A`(float), `Trigger`(trigger) | `Result`(float) | `currentValueA`(float) |
| `trunc` | Trunc | `A`(float), `Trigger`(trigger) | `Result`(float) | `currentValueA`(float) |

## Operation

| id | title | inputs | outputs | settable |
| --- | --- | --- | --- | --- |
| `AbletonLink` | AbletonLink | `Set Tempo`(float), `Set Quantum`(float), `Enable`(bool), `Reset Beat`(trigger) | `Beat`(float), `Phase`(float), `Tempo`(float), `Num Peers`(float), `Beat Trigger`(trigger), `Bar Trigger`(trigger) | `setTempoInput`(float), `setQuantumInput`(float), `enableInput`(bool), `isEnabled`(bool), `numPeers`(int) |
| `and` | And | `A`(float), `B`(float) | `Result`(float) | `currentValueA`(float), `currentValueB`(float) |
| `average` | Average | `A`(float), `B`(float) | `Result`(float) | `currentValueA`(float), `currentValueB`(float) |
| `StringCombine` | Combine | `String A`(string), `String B`(string) | `Combined String`(string) | `inputA`(string), `inputB`(string), `separator`(string), `suffix`(string) |
| `Counter` | Counter | `Count Trigger`(trigger), `Reset Trigger`(trigger), `Min Value`(int), `Max Value`(int), `Loop`(bool) | `Count Output`(int) | `minValueInput`(int), `maxValueInput`(int), `loopInput`(bool), `currentCount`(int), `minValue`(int), `maxValue`(int), `loop`(bool) |
| `Easing` | Easing | `Is Loop`(bool), `Start Value`(float), `End Value`(float), `Duration`(float), `Restart Trigger`(trigger) | `Easing Value`(float), `On Complete`(trigger) | `isLoopInput`(bool), `startInput`(float), `endInput`(float), `timeInput`(float), `startValue`(float), `endValue`(float), `timeValue`(float), `isLoop`(bool), `isLoopA`(bool) |
| `Everything` | Everything | — | `File Path`(string) | `currentUrl`(string), `resolution`(float), `lastFilePath`(string) |
| `GlobalTempo` | GlobalTempo | `In`(float) | `Out`(float) | `inputA`(float), `currentValue`(float) |
| `IFFilter` | IFFilter | `Value A`(float), `Value B`(float), `Trigger`(trigger) | `True Output`(float), `False Output`(float), `True Trigger`(trigger), `False Trigger`(trigger) | `floatInputA`(float), `floatInputB`(float), `currentValueA`(float), `currentValueB`(float) |
| `lerp` | Lerp | `A`(float), `B`(float), `T`(float), `Trigger`(trigger) | `Out`(float) | `inputA`(float), `inputB`(float), `inputT`(float), `valueA`(float), `valueB`(float), `valueT`(float) |
| `max` | Max | `A`(float), `B`(float) | `Result`(float) | `currentValueA`(float), `currentValueB`(float) |
| `MediaBrowserIndex` | MediaBrowserIndex | `Index`(int), `Trigger`(trigger) | `File Path`(string), `Item Count`(int) | `indexInput`(int), `currentIndex`(int), `selectedFolderGuid`(string), `currentPath`(string), `itemCount`(int) |
| `min` | Min | `A`(float), `B`(float) | `Result`(float) | `currentValueA`(float), `currentValueB`(float) |
| `not` | Not | `A`(float), `B`(float) | `Result`(float) | `currentValueA`(float), `currentValueB`(float) |
| `or` | Or | `A`(float), `B`(float) | `Result`(float) | `currentValueA`(float), `currentValueB`(float) |
| `random` | Random | `A`(float), `B`(float), `Trigger`(trigger) | `Result`(float) | `currentValueA`(float), `currentValueB`(float) |
| `StepSequencer` | Step Sequencer | `BPM`(float), `Toggle Play`(bool), `Reset`(trigger) | — | `bpmInput`(float), `toggleInput`(bool), `currentBpm`(float), `stepCount`(int), `trackCount`(int), `isPlaying`(bool), `currentStep`(int) |
| `TapTempo` | Tap Tempo | `Tap Input`(trigger), `Reset`(trigger) | `BPM Output`(float) | `currentBpm`(int) |
| `xor` | Xor | `A`(float), `B`(float) | `Result`(float) | `currentValueA`(float), `currentValueB`(float) |

## ProFx

| id | title | inputs | outputs | settable |
| --- | --- | --- | --- | --- |
| `AdaptiveMosaic` | Adaptive Mosaic | `Shuffle`(trigger), `NextFocus`(trigger), `Beat`(trigger), `FocusSource`(int), `TileCount`(int), `FocusAmount`(float), `Transition`(float), `AutoBeat`(bool), `Pause`(bool), `FocusOutline`(bool) | `Out`(RenderTexture) | `focusSourceInput`(int), `tileCountInput`(int), `focusAmountInput`(float), `transitionInput`(float), `autoBeatInput`(bool), `pauseInput`(bool), `focusOutlineInput`(bool), `currentTileCount`(int), `currentFocusSource`(int), `currentBeatInterval`(int), `currentFocusAmount`(float), `currentTransitionSeconds`(float), `currentRandomness`(float), `currentGap`(float), `currentRoundness`(float), `currentDrift`(float), `currentAccent`(float), `currentAutoBeat`(bool), `currentPauseMotion`(bool), `currentFocusOutline`(bool) |
| `DepthOutput` | Depth Output | `Input Texture`(RenderTexture), `Enable`(bool), `Inference Every N Frames`(int) | `Depth Output`(RenderTexture) | `enableInput`(bool), `skipFramesInput`(int), `isEnabled`(bool), `inferenceEveryNFrames`(int) |
| `YoloDetection` | Object Detection | `Input Texture`(RenderTexture), `Enable`(bool), `Confidence Threshold`(float), `Inference Every N Frames`(int), `Max Detections`(int) | `Mask Output`(RenderTexture), `detectedCenterX0`(float), `detectedCenterY0`(float) | `enableInput`(bool), `confidenceInput`(float), `skipFramesInput`(int), `maxDetectionsInput`(int), `isEnabled`(bool), `confidenceThreshold`(float), `inferenceEveryNFrames`(int), `maxDetections`(int) |
| `pixelsort` | PixelSort | `Layer`(RenderTexture), `Mask`(RenderTexture), `Enable`(bool), `Direction`(bool), `Ascending`(bool), `ThresholdMin`(float), `ThresholdMax`(float) | `Out`(RenderTexture) | `isUsingInput`(bool), `directionInput`(bool), `ascendingInput`(bool), `thresholdMinInput`(float), `thresholdMaxInput`(float), `currentIsUsing`(bool), `currentDirection`(bool), `currentAscending`(bool), `currentThresholdMin`(float), `currentThresholdMax`(float) |
| `UVGenerator` | UV Generator | `Offset`(float) | `Composed Output`(RenderTexture) | `offsetInput`(float), `displayMode`(int), `singleIndex`(int), `offset`(float), `regionCount`(int) |
| `UVMapper` | UV Mapper | `Layer Texture`(RenderTexture), `Chase Offset (0-1)`(float), `Chase Width`(float) | `Output`(RenderTexture) | `chaseOffsetInput`(float), `chaseWidthInput`(float), `chaseOffset`(float), `chaseWidth`(float) |

## Texture

| id | title | inputs | outputs | settable |
| --- | --- | --- | --- | --- |
| `AppFxChain` | App Fx Chain | `Source`(RenderTexture) | `Render Texture`(RenderTexture) | — |
| `AppMediaPlayer` | App Media Player | `Media Path`(string) | `Render Texture`(RenderTexture) | `pathInput`(string), `mediaPath`(string) |
| `AppOffscreenLayer` | App Offscreen Layer | — | `Render Texture`(RenderTexture) | `opacity`(float), `rotationZ`(float), `positionX`(float), `positionY`(float), `scaleX`(float), `scaleY`(float) |
| `AppTextureSource` | App Texture Source | — | `Render Texture`(RenderTexture) | `sourceName`(string) |
| `ColorTexture` | Color Texture | `Color`(Color), `Size X`(float), `Size Y`(float), `Position X`(float), `Position Y`(float) | `Render Texture`(RenderTexture) | `sizeXInput`(float), `sizeYInput`(float), `posXInput`(float), `posYInput`(float), `sizeX`(float), `sizeY`(float), `posX`(float), `posY`(float) |
| `CrossFade` | CrossFade | `Texture A`(RenderTexture), `Texture B`(RenderTexture), `Mix`(float) | `Out`(RenderTexture) | `mixInput`(float), `mixValue`(float) |
| `Feedback` | Feedback | `Source`(RenderTexture), `Loop (feedback)`(RenderTexture), `Feedback amount`(float), `Reset`(trigger) | `Render Texture`(RenderTexture) | `feedbackInput`(float), `feedback`(float) |
| `NDIReceiver` | NDIReceiver | — | `RenderTexture Output`(RenderTexture) | `currentNDIName`(string) |
| `NDISender` | NDISender | `RenderTexture Input`(RenderTexture) | — | `currentSendNDIName`(string) |
| `TextOverlay` | Overlay | `Title Text`(string), `Artist Text`(string) | `Render Texture`(RenderTexture) | `titleInput`(string), `artistInput`(string), `title`(string), `artist`(string), `customCSS`(string) |
| `ReactionDiffusion` | Reaction Diffusion | `Feed`(float), `Kill`(float), `Iterations/frame`(float), `Reseed`(trigger) | `Render Texture`(RenderTexture) | `feedInput`(float), `killInput`(float), `speedInput`(float), `feed`(float), `kill`(float), `speed`(float) |
| `SpoutReceiver` | SpoutReceiver | — | `RenderTexture Output`(RenderTexture) | `currentSourceName`(string) |
| `SpoutSender` | SpoutSender | `RenderTexture Input`(RenderTexture) | — | `currentSendName`(string) |
| `AppStackMixer` | Stack Mixer | `Texture 1`(RenderTexture), `Texture 2`(RenderTexture), `Texture 3`(RenderTexture), `Texture 4`(RenderTexture), `Texture 5`(RenderTexture), `Texture 6`(RenderTexture), `Texture 7`(RenderTexture), `Texture 8`(RenderTexture) | `Out`(RenderTexture) | `opacity1`(float), `opacity2`(float), `opacity3`(float), `opacity4`(float), `opacity5`(float), `opacity6`(float), `opacity7`(float), `opacity8`(float), `blend1`(int), `blend2`(int), `blend3`(int), `blend4`(int), `blend5`(int), `blend6`(int), `blend7`(int), `blend8`(int) |
| `AppTextRender` | Text Render | — | `Render Texture`(RenderTexture) | `fontSize`(float), `colorR`(float), `colorG`(float), `colorB`(float), `colorA`(float), `text`(string), `alignment`(int) |
| `Transform` | Transform | `Render Texture`(RenderTexture), `Zoom`(float), `Rotate`(float) | `Render Texture`(RenderTexture) | `zoomInput`(float), `rotateInput`(float), `zoom`(float), `rotate`(float), `offsetX`(float), `offsetY`(float) |
| `WebCamera` | WebCamera | — | `RenderTexture Output`(RenderTexture) | `currentDeviceName`(string), `requestedWidth`(int), `requestedHeight`(int), `requestedFPS`(int) |
| `WebView` | WebView | `URL`(string) | `Render Texture`(RenderTexture) | `urlInput`(string), `currentUrl`(string), `resolution`(float) |
| `WindowCapture` | Window Capture | — | `Capture Texture`(RenderTexture) | `selectedIndex`(int), `selectedWindowName`(string) |
| `YouTubeMV` | YouTube | `Search Query`(string), `Next Result`(trigger), `Previous Result`(trigger), `Volume (0-1)`(float) | `Render Texture`(RenderTexture) | `queryInput`(string), `volumeInput`(float), `searchQuery`(string), `resolution`(float), `autoFullscreen`(bool), `currentVideoTitle`(string), `currentIndex`(int), `volume`(float), `currentTime`(float), `duration`(float), `isMuted`(bool) |

## UI

| id | title | inputs | outputs | settable |
| --- | --- | --- | --- | --- |
| `Button` | Button | — | `Bool Output`(bool) | — |
| `Slider` | Slider | `Min`(float), `Max`(float) | `Out`(float) | `minInput`(float), `maxInput`(float), `sliderMin`(float), `sliderMax`(float), `sliderValue`(float), `isVertical`(bool) |
| `Toggle` | Toggle | — | `Bool Output`(bool) | `toggleValue`(bool) |

## Variable

| id | title | inputs | outputs | settable |
| --- | --- | --- | --- | --- |
| `Color` | Color | `Color In`(Color), `Trigger`(trigger) | `Color Out`(Color) | — |
| `float` | Float | `In`(float), `Trigger`(trigger) | `Out`(float) | `inputA`(float), `currentValue`(float) |
| `int` | Int | `In`(int), `Trigger`(trigger) | `Out`(int) | `inputA`(int), `currentValue`(int) |
| `string` | String | `In`(string), `Trigger`(trigger) | `Out`(string) | `inputA`(string), `currentValue`(string) |

_103 node types._

