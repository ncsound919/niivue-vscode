import * as vscode from 'vscode'
import { HardwareDevice, getDevicesByCategory, getHardwareCategories } from './hardwareCatalog'
import type { HardwareManager } from './hardwareManager'

type HardwareTreeNode =
  | { kind: 'category'; label: string }
  | { kind: 'device'; device: HardwareDevice }

export class HardwareTreeItem extends vscode.TreeItem {
  constructor(
    public readonly node: HardwareTreeNode,
    connected?: boolean,
  ) {
    const label =
      node.kind === 'category'
        ? node.label
        : `${node.device.id} — ${node.device.name}`

    const collapsibleState =
      node.kind === 'category'
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None

    super(label, collapsibleState)

    if (node.kind === 'category') {
      this.iconPath = new vscode.ThemeIcon('folder')
      this.contextValue = 'hardwareCategory'
    } else {
      const isConnected = connected === true
      this.iconPath = new vscode.ThemeIcon(
        'circuit-board',
        new vscode.ThemeColor(isConnected ? 'testing.iconPassed' : 'disabledForeground'),
      )
      this.contextValue = isConnected ? 'hardwareDevice.connected' : 'hardwareDevice.disconnected'
      this.tooltip = new vscode.MarkdownString(
        [
          `**${node.device.name}** (${node.device.id})`,
          ``,
          node.device.description,
          ``,
          `**Platforms:** ${node.device.supportedPlatforms.join(', ')}`,
          ``,
          `**Key Tools:** ${node.device.keyTools.join(', ')}`,
          ``,
          isConnected ? `$(pass-filled) Connected` : `$(circle-slash) Disconnected`,
        ].join('\n'),
      )
      this.tooltip.isTrusted = true
      this.command = {
        command: 'wetlab.showHardwareDetails',
        title: 'Show Hardware Details',
        arguments: [node.device],
      }
    }
  }
}

export class HardwareTreeProvider implements vscode.TreeDataProvider<HardwareTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

  constructor(private readonly manager?: HardwareManager) {
    manager?.onDidChangeState(() => this.refresh())
  }

  refresh(): void {
    this._onDidChangeTreeData.fire()
  }

  getTreeItem(element: HardwareTreeItem): vscode.TreeItem {
    return element
  }

  getChildren(element?: HardwareTreeItem): HardwareTreeItem[] {
    if (!element) {
      return getHardwareCategories().map(
        (cat) => new HardwareTreeItem({ kind: 'category', label: cat }),
      )
    }

    if (element.node.kind === 'category') {
      return getDevicesByCategory(element.node.label).map((device) => {
        const connected = this.manager?.getState(device.id)?.connected ?? false
        return new HardwareTreeItem({ kind: 'device', device }, connected)
      })
    }

    return []
  }
}

