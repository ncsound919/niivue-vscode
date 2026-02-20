import * as vscode from 'vscode'
import { HardwareDevice, getDevicesByCategory, getHardwareCategories } from './hardwareCatalog'

type HardwareTreeNode =
  | { kind: 'category'; label: string }
  | { kind: 'device'; device: HardwareDevice }
  | { kind: 'info'; label: string }

export class HardwareTreeItem extends vscode.TreeItem {
  constructor(public readonly node: HardwareTreeNode) {
    const label =
      node.kind === 'category'
        ? node.label
        : node.kind === 'device'
          ? `${node.device.id} — ${node.device.name}`
          : node.label

    const collapsibleState =
      node.kind === 'category'
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None

    super(label, collapsibleState)

    if (node.kind === 'category') {
      this.iconPath = new vscode.ThemeIcon('folder')
      this.contextValue = 'hardwareCategory'
    } else if (node.kind === 'device') {
      this.iconPath = new vscode.ThemeIcon('circuit-board')
      this.contextValue = 'hardwareDevice'
      this.tooltip = new vscode.MarkdownString(
        [
          `**${node.device.name}** (${node.device.id})`,
          ``,
          node.device.description,
          ``,
          `**Platforms:** ${node.device.supportedPlatforms.join(', ')}`,
          ``,
          `**Key Tools:** ${node.device.keyTools.join(', ')}`,
        ].join('\n'),
      )
      this.command = {
        command: 'wetlab.showHardwareDetails',
        title: 'Show Hardware Details',
        arguments: [node.device],
      }
    } else {
      this.iconPath = new vscode.ThemeIcon('info')
      this.contextValue = 'hardwareInfo'
    }
  }
}

export class HardwareTreeProvider implements vscode.TreeDataProvider<HardwareTreeItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>()
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event

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
      return getDevicesByCategory(element.node.label).map(
        (device) => new HardwareTreeItem({ kind: 'device', device }),
      )
    }

    return []
  }
}
