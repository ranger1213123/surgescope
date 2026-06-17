import type { OdFlowData, OdLink, OdNode } from "../../types";

export function buildChordMatrix(data: OdFlowData) {
  const nodeIndex = new Map(data.nodes.map((node, index) => [node.id, index]));
  const matrix = data.nodes.map(() => data.nodes.map(() => 0));

  for (const link of data.links) {
    const sourceIndex = nodeIndex.get(link.source);
    const targetIndex = nodeIndex.get(link.target);
    if (sourceIndex === undefined || targetIndex === undefined) {
      continue;
    }
    matrix[sourceIndex][targetIndex] += link.value;
  }

  return { matrix, nodeIndex };
}

export function linkTouchesNode(link: OdLink, nodeId: string | null) {
  return Boolean(nodeId && (link.source === nodeId || link.target === nodeId));
}

export function isRelatedToNode(node: OdNode, links: OdLink[], nodeId: string | null) {
  if (!nodeId) {
    return false;
  }
  return node.id === nodeId || links.some((link) => linkTouchesNode(link, nodeId) && linkTouchesNode(link, node.id));
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(Math.round(value));
}
