export interface HardwareImplementationGuide {
  prerequisites: string[]
  steps: string[]
  codeExample: string
  overlay365Integration: string
}

export interface HardwareDevice {
  id: string
  name: string
  category: string
  description: string
  supportedPlatforms: string[]
  keyTools: string[]
  implementationGuide: HardwareImplementationGuide
}

export const HARDWARE_CATALOG: HardwareDevice[] = [
  {
    id: 'HW-01',
    name: 'Raspberry Pi Camera Module v2 / HQ Camera',
    category: 'Imaging Devices',
    description:
      'High-resolution (8-12 MP) CSI camera for macro/time-lapse/fluorescence on RPi edge node. Perfect for live streaming or 4K video capture into NIfTI stacks.',
    supportedPlatforms: ['Raspberry Pi Edge', 'Browser via MJPEG/RTSP stream'],
    keyTools: ['libcamera', 'picamera2', 'OpenCV', 'FFmpeg'],
    implementationGuide: {
      prerequisites: [
        'Raspberry Pi 4/5 with camera ribbon cable connected',
        'Raspberry Pi OS Bookworm',
        'Camera enabled via raspi-config',
      ],
      steps: [
        '1. sudo apt update && sudo apt install python3-picamera2 python3-opencv ffmpeg',
        '2. Enable camera: sudo raspi-config → Interface Options → Legacy Camera → Enable (or use libcamera directly)',
        '3. Test: libcamera-still -o test.jpg or picamera2 script',
        '4. For time-lapse: python script with picamera2 + FFmpeg to 4D NIfTI via nibabel',
        '5. Push to Overlay365: watchdog script on captured frames → auto-convert + metadata ingest',
      ],
      codeExample:
        "import picamera2; picam2 = picamera2.Picamera2(); picam2.start(); frame = picam2.capture_array(); cv2.imwrite('frame.jpg', frame)",
      overlay365Integration:
        'RTSP server (ffmpeg -i pipe: ...) or direct file watcher → NIfTI + JSON metadata (temp/pH via RPi sensors) → NiiVue load',
    },
  },
  {
    id: 'HW-02',
    name: 'USB/UVC Webcams (Logitech, Arducam, etc.)',
    category: 'Imaging Devices',
    description:
      'Browser-native or edge capture for quick macro imaging. Zero-install for laptop-based wet labs.',
    supportedPlatforms: ['Browser (WebUSB/MediaDevices)', 'Any OS Edge'],
    keyTools: ['navigator.mediaDevices.getUserMedia', 'MediaRecorder', 'FFmpeg'],
    implementationGuide: {
      prerequisites: ['Chrome/Edge browser', 'UVC-compliant camera'],
      steps: [
        '1. In Overlay365 React component: request getUserMedia({video: {width: {ideal: 4096}}})',
        '2. Live preview <video> element',
        '3. Record with MediaRecorder → Blob → upload or convert to NIfTI',
        '4. Auto-metadata: embed timestamp, device ID',
      ],
      codeExample:
        'navigator.mediaDevices.getUserMedia({video: true}).then(stream => { video.srcObject = stream; recorder = new MediaRecorder(stream); })',
      overlay365Integration:
        'Direct ingest button → FFmpeg transcoding on edge or cloud → virtual specimen',
    },
  },
  {
    id: 'HW-03',
    name: 'DSLR / Mirrorless Cameras (Canon, Nikon, Sony)',
    category: 'Imaging Devices',
    description: 'High-end 4K/8K macro via USB tethering. Ideal for detailed reactions/crystal growth.',
    supportedPlatforms: ['Raspberry Pi Edge (gPhoto2)', 'Browser (tethr library)'],
    keyTools: ['gPhoto2', 'tethr (WebUSB)', 'FFmpeg'],
    implementationGuide: {
      prerequisites: ['Supported DSLR (check gphoto.org support list)', 'USB cable'],
      steps: [
        'RPi: sudo apt install gphoto2; gphoto2 --auto-detect',
        'Capture: gphoto2 --capture-image-and-download --filename %Y%m%d_%H%M%S.jpg',
        'Time-lapse: gphoto2 --interval 5 --capture-image-and-download',
        'Browser: npm install tethr; connect via WebUSB',
      ],
      codeExample:
        'gphoto2 --set-config /main/capturesettings/shutterspeed=1/100 --capture-image',
      overlay365Integration:
        'Script watches download folder → calibrate with ColorChecker → NIfTI stack + EXIF metadata',
    },
  },
  {
    id: 'HW-04',
    name: 'OpenFlexure Microscope',
    category: 'Full Microscope Systems',
    description:
      'Open-source 3D-printed motorized microscope with RPi HQ camera. Full XYZ control + fluorescence.',
    supportedPlatforms: ['Raspberry Pi Edge'],
    keyTools: ['OpenFlexure Connect', 'Micro-Manager adapter', 'ImSwitch'],
    implementationGuide: {
      prerequisites: ['Assembled OpenFlexure kit', 'RPi with Sangaboard'],
      steps: [
        '1. Flash Raspbian-OpenFlexure image',
        '2. Run OpenFlexure Server',
        '3. Control via browser or Micro-Manager (use OpenFlexure adapter)',
        '4. Acquire multi-position/time-lapse',
      ],
      codeExample: 'Via REST API: curl http://openflexure.local/api/v2/position',
      overlay365Integration:
        'Export stacks or stream → direct NiiVue load with motorized metadata',
    },
  },
  {
    id: 'HW-05',
    name: 'openUC2 Modular Optics System',
    category: 'Full Microscope Systems',
    description:
      'LEGO-like cube system for custom brightfield/fluorescence microscopes with RPi automation.',
    supportedPlatforms: ['Raspberry Pi Edge'],
    keyTools: ['ImSwitch', 'UC2-ExperimentController'],
    implementationGuide: {
      prerequisites: ['UC2 cubes + RPi + camera/lenses'],
      steps: [
        '1. Assemble per UC2-GIT repo',
        '2. Install ImSwitch on RPi',
        '3. Configure FRAME microscope profile',
        '4. Run high-throughput scans',
      ],
      codeExample: 'ImSwitch Python API for automated acquisition loops',
      overlay365Integration: 'ImSwitch exports → FFmpeg/NIfTI ingest pipeline',
    },
  },
  {
    id: 'HW-06',
    name: 'Arduino (Uno, Nano, ESP32) + Sensors',
    category: 'Sensors & Environmental Control',
    description:
      'pH, temp (DS18B20/DHT22), humidity, light, flow sensors. Real-time metadata embedding.',
    supportedPlatforms: ['Browser (WebUSB/WebSerial)', 'RPi/Edge'],
    keyTools: ['Firmata/PyFirmata', 'WebSerial API', 'Arduino IDE'],
    implementationGuide: {
      prerequisites: ['Arduino IDE', 'Sensor wired (e.g., pH via ADS1115)'],
      steps: [
        '1. Upload StandardFirmata or custom sketch',
        '2. Browser: navigator.serial.requestPort()',
        '3. Read sensor values every frame',
        '4. Send JSON metadata to Overlay365',
      ],
      codeExample: 'Serial.println("{\\"pH\\":7.2,\\"temp\\":37.1}");',
      overlay365Integration: 'Parse serial → attach to current capture as NIfTI sidecar',
    },
  },
  {
    id: 'HW-07',
    name: 'Arduino with WebUSB / TinyUSB',
    category: 'Browser-Native Control',
    description: 'Direct browser control of GPIO, sensors, LEDs without server.',
    supportedPlatforms: ['Browser (Chrome/Edge)'],
    keyTools: ['Adafruit TinyUSB', 'WebUSB API'],
    implementationGuide: {
      prerequisites: ['Arduino with TinyUSB support (e.g., Circuit Playground Express)'],
      steps: [
        '1. Install Adafruit_TinyUSB library',
        '2. Upload WebUSB sketch (see Adafruit guide)',
        '3. Browser landing page → connect',
        '4. Bidirectional control',
      ],
      codeExample: 'See Adafruit WebUSB serial echo example (full sketch in guide)',
      overlay365Integration:
        'Overlay365 Hardware tab uses same WebUSB connect → live sensor overlay',
    },
  },
  {
    id: 'HW-08',
    name: 'Micro-Manager Supported Cameras & Stages',
    category: 'Professional Lab Hardware',
    description:
      'Andor, Hamamatsu, FLIR, ASI stages, Prior, Thorlabs, Zaber, etc. via unified API.',
    supportedPlatforms: ['Windows/Linux Edge (Pycro-Manager)'],
    keyTools: ['Pycro-Manager', 'Micro-Manager 2.0'],
    implementationGuide: {
      prerequisites: ['Micro-Manager installed', 'Vendor SDKs'],
      steps: [
        '1. Hardware Config Wizard → add devices',
        "2. Python: import pycromanager; core = Bridge().get_core()",
        "3. Acquire: core.snap_image(); core.set_position('Z', 100)",
        '4. Multi-D acquisition',
      ],
      codeExample:
        "from pycromanager import Bridge; core = Bridge().get_core(); core.set_config('Channel', 'DAPI')",
      overlay365Integration:
        'Pycro-Manager script exports ND2/TIFF → auto-convert to NIfTI + metadata',
    },
  },
  {
    id: 'HW-09',
    name: 'Python-Microscope Devices (RPi, Andor, Zaber, CoolLED)',
    category: 'Professional Lab Hardware',
    description: 'Vendor-agnostic Python control for cameras, stages, lights, mirrors.',
    supportedPlatforms: ['Any Python Edge'],
    keyTools: ['python-microscope', 'Microscope-Cockpit'],
    implementationGuide: {
      prerequisites: ['pip install microscope', 'Vendor SDKs'],
      steps: [
        '1. from microscope.cameras.picamera import PiCamera',
        '2. cam = PiCamera(); cam.arm(); img = cam.snap()',
        '3. Combine with stages/lights via common API',
      ],
      codeExample: 'See python-microscope.org examples for each device',
      overlay365Integration:
        'Python service exposes REST/WebSocket → Overlay365 triggers + ingests',
    },
  },
  {
    id: 'HW-10',
    name: 'Motorized Stages & Filter Wheels (Zaber, Thorlabs, ASI)',
    category: 'Actuators & Automation',
    description:
      'XYZ positioning, filter switching for multi-well or multi-position experiments.',
    supportedPlatforms: ['Micro-Manager / Python-Microscope / Arduino'],
    keyTools: ['Micro-Manager', 'Zaber ASCII', 'Kinesis'],
    implementationGuide: {
      prerequisites: ['Stage connected via USB/serial'],
      steps: [
        '1. Add to Micro-Manager config',
        '2. or Python: zaber = ZaberDaisyChain(...)',
        '3. Move: stage.move_to(100, 200)',
      ],
      codeExample: 'stage.move_to_position(0, 5000, 0)',
      overlay365Integration: 'Position metadata per frame → 4D NIfTI with spatial tags',
    },
  },
  {
    id: 'HW-11',
    name: 'Syringe Pumps & Microfluidics (Aladdin, Elveflow via MM)',
    category: 'Fluid Handling',
    description: 'Precise reagent delivery for dynamic experiments.',
    supportedPlatforms: ['Micro-Manager Edge'],
    keyTools: ['Micro-Manager Aladdin adapter', 'Elveflow SDK'],
    implementationGuide: {
      prerequisites: ['Pump connected'],
      steps: ['Add device in MM config → script flow rates synchronized with imaging'],
      codeExample: "core.set_property('Aladdin', 'FlowRate', 0.5)",
      overlay365Integration: 'Flow metadata embedded → queryable virtual specimens',
    },
  },
  {
    id: 'HW-12',
    name: 'Environmental Chambers (Okolab, Pecon via MM)',
    category: 'Sensors & Environmental Control',
    description: 'CO2/temp/humidity control for live-cell imaging.',
    supportedPlatforms: ['Micro-Manager'],
    keyTools: ['Micro-Manager Okolab/Pecon adapters'],
    implementationGuide: {
      prerequisites: ['Chamber USB connected'],
      steps: ['Configure in MM → set temp/CO2 in acquisition loop'],
      codeExample: "core.set_property('Okolab', 'Temperature', 37)",
      overlay365Integration: 'Continuous logging → sidecar JSON for every time-point',
    },
  },
]

/** Returns all unique hardware categories from the catalog */
export function getHardwareCategories(): string[] {
  return [...new Set(HARDWARE_CATALOG.map((d) => d.category))]
}

/** Returns all devices belonging to a given category */
export function getDevicesByCategory(category: string): HardwareDevice[] {
  return HARDWARE_CATALOG.filter((d) => d.category === category)
}
