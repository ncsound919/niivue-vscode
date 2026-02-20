import * as vscode from 'vscode'
import { SpecimenEntry, SpecimenRegistry } from './registry'

const SHA256_PREVIEW_LENGTH = 16

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export class SpecimenTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly specimenEntry?: SpecimenEntry,
    public readonly isInfo?: boolean,
  ) {
    super(label, collapsibleState)

    if (specimenEntry && !isInfo) {
      const registered = new Date(specimenEntry.registeredAt).toLocaleString()
      this.tooltip = new vscode.MarkdownString(
        `**${specimenEntry.name}**\n\nRegistered: ${registered}\n\nURI: ${specimenEntry.uri}`,
      )
      this.iconPath = new vscode.ThemeIcon('file-media')
      this.contextValue = 'wetlabSpecimen'
      this.command = {
        command: 'wetlab.openSpecimen',
        title: 'Open Specimen',
        arguments: [specimenEntry.uri],
      }
    } else if (isInfo) {
      this.iconPath = new vscode.ThemeIcon('info')
      this.contextValue = 'wetlabInfo'
    }
  }
}

export class WetLabTreeProvider implements vscode.TreeDataProvider<SpecimenTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  constructor(private readonly registry: SpecimenRegistry) {}

  refresh(): void {
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: SpecimenTreeItem): vscode.TreeItem {
    return element
  }

  getChildren(element?: SpecimenTreeItem): SpecimenTreeItem[] {
    if (!element) {
      const specimens = this.registry.list()
      if (specimens.length === 0) {
        return [
          new SpecimenTreeItem(
            'No specimens registered yet',
            vscode.TreeItemCollapsibleState.None,
            undefined,
            true,
          ),
        ]
      }
      return specimens.map(
        (s) => new SpecimenTreeItem(s.name, vscode.TreeItemCollapsibleState.Collapsed, s),
      )
    }

    if (!element.specimenEntry) {
      return []
    }

    const s = element.specimenEntry
    const items: SpecimenTreeItem[] = []
    const info = (label: string) =>
      new SpecimenTreeItem(label, vscode.TreeItemCollapsibleState.None, undefined, true)

    items.push(info(`Registered: ${new Date(s.registeredAt).toLocaleString()}`))

    if (s.fileSizeBytes !== undefined) {
      items.push(info(`Size: ${formatBytes(s.fileSizeBytes)}`))
    }
    if (s.sha256) {
      items.push(info(`SHA-256: ${s.sha256.slice(0, SHA256_PREVIEW_LENGTH)}…`))
    }
    if (s.dimensions) {
      items.push(info(`Dimensions: ${s.dimensions}`))
    }
    if (s.tags.length > 0) {
      items.push(info(`Tags: ${s.tags.join(', ')}`))
    }

    const lastAction = s.provenance[s.provenance.length - 1]
    if (lastAction) {
      const lastNote = lastAction.note ? `: "${lastAction.note}"` : ''
      items.push(
        info(
          `Last action: ${lastAction.action}${lastNote} — ${new Date(lastAction.timestamp).toLocaleString()}`,
        ),
      )
    }

    return items
  }
}
