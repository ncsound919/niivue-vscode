import * as http from 'http'
import * as https from 'https'
import * as vscode from 'vscode'
import { HARDWARE_CATALOG } from './hardwareCatalog'
import type { SpecimenRegistry } from './registry'

export type AcquisitionMethod = 'folder-watcher' | 'http-rest' | 'cli'

/** Configuration supplied when connecting a hardware device */
export interface DeviceConnectionConfig {
  method: AcquisitionMethod
  /** Folder to watch for new files (folder-watcher / cli output directory) */
  watchFolder?: string
  /** REST API base URL for http-rest devices, e.g. http://openflexure.local */
  restUrl?: string
  /** Shell command to execute for acquisition (cli method) */
  cliCommand?: string
  /**
   * Glob pattern for files to watch.
   * Defaults to all common imaging formats.
   */
  filePattern?: string
}

export interface DeviceState {
  readonly deviceId: string
  connected: boolean
  config?: DeviceConnectionConfig
  lastAcquiredAt?: string
  specimenCount: number
}

/** Default file pattern covering common lab imaging formats */
const DEFAULT_FILE_PATTERN = '**/*.{nii,nii.gz,dcm,nrrd,nhdr,tiff,tif,jpg,jpeg,png}'

/**
 * Manages hardware device connections and acquisition for the Digital Wet Lab.
 *
 * Supported integration methods:
 *  - **folder-watcher**: Watches an output folder; any new file is auto-registered
 *    as a specimen. Works for gPhoto2, Pycro-Manager, OpenFlexure file exports, etc.
 *  - **http-rest**: Pings a REST endpoint to confirm connectivity, then issues an
 *    HTTP POST to trigger acquisition. Suitable for OpenFlexure, ImSwitch, etc.
 *  - **cli**: Opens a VS Code terminal and runs a capture command (e.g. gphoto2,
 *    libcamera-still). Pair with a folder-watcher on the output directory to
 *    auto-register the resulting file.
 */
export class HardwareManager implements vscode.Disposable {
  private readonly states = new Map<string, DeviceState>()
  private readonly watchers = new Map<string, vscode.FileSystemWatcher>()

  private readonly _onDidChangeState = new vscode.EventEmitter<string>()
  /** Fires with the deviceId whenever a device's state changes */
  readonly onDidChangeState = this._onDidChangeState.event

  constructor(private readonly registry: SpecimenRegistry) {
    for (const device of HARDWARE_CATALOG) {
      this.states.set(device.id, {
        deviceId: device.id,
        connected: false,
        specimenCount: 0,
      })
    }
  }

  getState(deviceId: string): DeviceState | undefined {
    return this.states.get(deviceId)
  }

  /** Connect a device using the provided configuration. */
  async connect(deviceId: string, config: DeviceConnectionConfig): Promise<void> {
    const state = this.states.get(deviceId)
    if (!state) {
      throw new Error(`Unknown device: ${deviceId}`)
    }

    // Tear down any previous watcher for this device
    this.watchers.get(deviceId)?.dispose()
    this.watchers.delete(deviceId)

    if (config.method === 'folder-watcher' || config.method === 'cli') {
      if (!config.watchFolder) {
        throw new Error('watchFolder is required for folder-watcher / cli devices')
      }
      const pattern = new vscode.RelativePattern(
        vscode.Uri.file(config.watchFolder),
        config.filePattern ?? DEFAULT_FILE_PATTERN,
      )
      const watcher = vscode.workspace.createFileSystemWatcher(pattern)
      this.watchers.set(deviceId, watcher)
      watcher.onDidCreate((uri) => void this._onFileCreated(deviceId, uri))
    }

    if (config.method === 'http-rest') {
      if (!config.restUrl) {
        throw new Error('restUrl is required for http-rest devices')
      }
      // Verify connectivity before marking as connected
      await this._httpPing(config.restUrl)
    }

    state.config = config
    state.connected = true
    this._onDidChangeState.fire(deviceId)
  }

  /** Disconnect a device and clean up its watcher. */
  disconnect(deviceId: string): void {
    const state = this.states.get(deviceId)
    if (!state) {
      return
    }
    this.watchers.get(deviceId)?.dispose()
    this.watchers.delete(deviceId)
    state.connected = false
    state.config = undefined
    this._onDidChangeState.fire(deviceId)
  }

  /**
   * Trigger an acquisition from a connected device.
   *
   * - **folder-watcher**: asks the user to pick a file that was already saved
   *   to the watch folder (for manual/external captures).
   * - **http-rest**: issues a POST to `{restUrl}/api/v2/actions/capture`.
   * - **cli**: opens a VS Code terminal and runs the configured command; the
   *   folder-watcher will auto-register the resulting file when it appears.
   */
  async acquire(deviceId: string): Promise<void> {
    const state = this.states.get(deviceId)
    if (!state?.connected || !state.config) {
      throw new Error(`Device ${deviceId} is not connected`)
    }

    const { method, restUrl, cliCommand, watchFolder } = state.config

    if (method === 'cli') {
      if (!cliCommand) {
        throw new Error('cliCommand is required for cli acquisition')
      }
      const terminal = vscode.window.createTerminal({
        name: `Wet Lab — Acquire (${deviceId})`,
      })
      terminal.sendText(cliCommand)
      terminal.show()
      // The folder-watcher will register the output file automatically
      vscode.window.showInformationMessage(
        `🔬 Running acquisition for ${deviceId}. Output will be auto-registered when the file appears in the watch folder.`,
      )
      return
    }

    if (method === 'http-rest') {
      if (!restUrl) {
        throw new Error('restUrl is required for http-rest acquisition')
      }
      await this._httpPost(`${restUrl}/api/v2/actions/capture`, {})
      state.lastAcquiredAt = new Date().toISOString()
      this._onDidChangeState.fire(deviceId)
      vscode.window.showInformationMessage(
        `🔬 Capture triggered on ${deviceId}. Check the device for the output file.`,
      )
      return
    }

    // folder-watcher: prompt user to register a specific file from the watch folder
    if (method === 'folder-watcher') {
      const defaultUri = watchFolder ? vscode.Uri.file(watchFolder) : undefined
      const picked = await vscode.window.showOpenDialog({
        defaultUri,
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        openLabel: 'Register as Specimen',
        title: `Register acquisition from ${deviceId}`,
      })
      if (picked?.[0]) {
        await this._onFileCreated(deviceId, picked[0])
      }
    }
  }

  dispose(): void {
    for (const watcher of this.watchers.values()) {
      watcher.dispose()
    }
    this.watchers.clear()
    this._onDidChangeState.dispose()
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async _onFileCreated(deviceId: string, uri: vscode.Uri): Promise<void> {
    const state = this.states.get(deviceId)
    if (!state) {
      return
    }
    try {
      await this.registry.register(uri, [`hardware:${deviceId}`])
      state.specimenCount += 1
      state.lastAcquiredAt = new Date().toISOString()
      this._onDidChangeState.fire(deviceId)
      vscode.window.showInformationMessage(
        `🧪 New specimen registered from ${deviceId}: ${uri.path.split('/').pop()}`,
      )
    } catch (err) {
      console.error(`[HardwareManager] Failed to register specimen from ${deviceId}:`, err)
    }
  }

  /** HEAD/GET a URL to verify the device is reachable. Throws on failure. */
  private _httpPing(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = new URL(url).protocol
      const mod = protocol === 'https:' ? https : http
      const req = mod.get(url, (res) => {
        res.resume() // drain the body
        const status = res.statusCode ?? 0
        if (status >= 200 && status < 300) {
          resolve()
        } else {
          reject(new Error(`Device responded with HTTP ${status}`))
        }
      })
      req.on('error', reject)
      req.setTimeout(5000, () => {
        req.destroy()
        reject(new Error('Connection timed out'))
      })
    })
  }

  /** POST JSON to a REST endpoint. Throws on network error or HTTP ≥ 400. */
  private _httpPost(url: string, body: object): Promise<string> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(body)
      const parsed = new URL(url)
      const options: http.RequestOptions = {
        hostname: parsed.hostname,
        port: parsed.port,
        path: parsed.pathname + parsed.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      }
      const mod = parsed.protocol === 'https:' ? https : http
      const req = mod.request(options, (res) => {
        let data = ''
        res.on('data', (chunk: Buffer) => {
          data += chunk.toString()
        })
        res.on('end', () => {
          if (res.statusCode !== undefined && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`))
          } else {
            resolve(data)
          }
        })
      })
      req.on('error', reject)
      req.setTimeout(10000, () => {
        req.destroy()
        reject(new Error('Request timed out'))
      })
      req.write(payload)
      req.end()
    })
  }
}
