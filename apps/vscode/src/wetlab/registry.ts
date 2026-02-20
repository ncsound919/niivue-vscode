import * as crypto from 'crypto'
import * as vscode from 'vscode'

export interface ProvenanceEntry {
  action: string
  timestamp: string
  note?: string
}

export interface SpecimenEntry {
  id: string
  name: string
  uri: string
  registeredAt: string
  fileSizeBytes?: number
  sha256?: string
  dimensions?: string
  tags: string[]
  provenance: ProvenanceEntry[]
}

export class SpecimenRegistry {
  private entries: Map<string, SpecimenEntry> = new Map()
  private readonly storageFile: vscode.Uri

  constructor(private readonly context: vscode.ExtensionContext) {
    this.storageFile = vscode.Uri.joinPath(context.globalStorageUri, 'wetlab-registry.json')
  }

  async load(): Promise<void> {
    try {
      const data = await vscode.workspace.fs.readFile(this.storageFile)
      const parsed = JSON.parse(Buffer.from(data).toString('utf-8'))
      this.entries = new Map(Object.entries(parsed))
    } catch {
      this.entries = new Map()
    }
  }

  async save(): Promise<void> {
    try {
      await vscode.workspace.fs.createDirectory(this.context.globalStorageUri)
      const data = JSON.stringify(Object.fromEntries(this.entries), null, 2)
      await vscode.workspace.fs.writeFile(this.storageFile, Buffer.from(data, 'utf-8'))
    } catch (e) {
      console.error('Failed to save wet lab registry:', e)
    }
  }

  async register(uri: vscode.Uri, tags: string[] = []): Promise<SpecimenEntry> {
    const name = uri.path.split('/').pop() ?? uri.toString()
    const id = crypto.createHash('sha256').update(uri.toString()).digest('hex')

    let fileSizeBytes: number | undefined
    let sha256: string | undefined
    try {
      const stat = await vscode.workspace.fs.stat(uri)
      fileSizeBytes = stat.size
      // Only compute SHA-256 for files smaller than 50 MB
      if (stat.size < 50 * 1024 * 1024) {
        const fileData = await vscode.workspace.fs.readFile(uri)
        sha256 = crypto.createHash('sha256').update(fileData).digest('hex')
      }
    } catch {
      // File may be remote or inaccessible; proceed without checksum
    }

    const now = new Date().toISOString()
    const existing = this.entries.get(id)

    const entry: SpecimenEntry = {
      id,
      name,
      uri: uri.toString(),
      registeredAt: existing?.registeredAt ?? now,
      fileSizeBytes,
      sha256,
      dimensions: existing?.dimensions,
      tags: [...new Set([...(existing?.tags ?? []), ...tags])],
      provenance: existing?.provenance ?? [],
    }

    entry.provenance.push({
      action: existing ? 'reopened' : 'registered',
      timestamp: now,
    })

    this.entries.set(id, entry)
    await this.save()
    return entry
  }

  get(id: string): SpecimenEntry | undefined {
    return this.entries.get(id)
  }

  getByUri(uri: string): SpecimenEntry | undefined {
    const id = crypto.createHash('md5').update(uri).digest('hex')
    return this.entries.get(id)
  }

  list(): SpecimenEntry[] {
    return Array.from(this.entries.values()).sort(
      (a, b) => new Date(b.registeredAt).getTime() - new Date(a.registeredAt).getTime(),
    )
  }

  remove(id: string): void {
    this.entries.delete(id)
  }

  async addNote(id: string, note: string): Promise<void> {
    const entry = this.entries.get(id)
    if (entry) {
      entry.provenance.push({ action: 'note', timestamp: new Date().toISOString(), note })
      await this.save()
    }
  }

  async updateDimensions(id: string, dimensions: string): Promise<void> {
    const entry = this.entries.get(id)
    if (entry) {
      entry.dimensions = dimensions
      await this.save()
    }
  }
}
