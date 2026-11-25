export type RowState = 'on' | 'off-self' | 'off-parent' | 'off-rule' | 'protected';

export interface PickEntry {
  relPath: string;
  isDir: boolean;
  ignored: boolean;
  protected: boolean;
}

function escapeGlob(path: string) {
  return path.replace(/[\\*?[\]{}]/g, '\\$&').replace(/ $/, '\\ ');
}

export function ruleFor(relPath: string, isDir: boolean) {
  return `/${escapeGlob(relPath)}${isDir ? '/' : ''}`;
}

export function ancestorsOf(relPath: string): string[] {
  const parts = relPath.split('/');
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
}

export function splitRules(globs: string[]) {
  const patterns: string[] = [];
  const excludes: string[] = [];
  const includes: string[] = [];
  for (const g of globs) {
    if (g.startsWith('!/')) includes.push(g);
    else if (g.startsWith('/')) excludes.push(g);
    else patterns.push(g);
  }
  return { patterns, excludes, includes };
}

export function joinRules(patterns: string[], excludes: string[], includes: string[]) {
  return [...new Set([...patterns, ...excludes, ...includes])];
}

export function stateOf(entry: PickEntry, globs: string[]): RowState {
  if (entry.protected) return 'protected';
  const { excludes } = splitRules(globs);
  if (excludes.includes(ruleFor(entry.relPath, entry.isDir))) return 'off-self';
  if (ancestorsOf(entry.relPath).some((a) => excludes.includes(ruleFor(a, true)))) return 'off-parent';
  return entry.ignored ? 'off-rule' : 'on';
}

export function hasExcludedInside(relPath: string, globs: string[]) {
  const prefix = ruleFor(relPath, true);
  return splitRules(globs).excludes.some((g) => g.startsWith(prefix) && g !== prefix);
}

export function turnOff(entry: PickEntry, globs: string[]): string[] {
  let { patterns, excludes, includes } = splitRules(globs);
  const own = ruleFor(entry.relPath, entry.isDir);
  if (includes.includes(`!${own}`)) {
    return joinRules(patterns, excludes, includes.filter((g) => g !== `!${own}`));
  }
  if (entry.isDir) {
    const inside = own;
    excludes = excludes.filter((g) => !g.startsWith(inside));
    includes = includes.filter((g) => !g.startsWith(`!${inside}`));
  }
  return joinRules(patterns, [...excludes, own], includes);
}

export function turnOn(
  entry: PickEntry,
  globs: string[],
  childrenOf: (dir: string) => PickEntry[] | undefined,
): string[] {
  const state = stateOf(entry, globs);
  const { patterns, excludes, includes } = splitRules(globs);
  const own = ruleFor(entry.relPath, entry.isDir);

  if (state === 'off-self') return joinRules(patterns, excludes.filter((g) => g !== own), includes);
  if (state === 'off-rule') return joinRules(patterns, excludes, [...includes, `!${own}`]);
  if (state !== 'off-parent') return globs;

  const chain = ancestorsOf(entry.relPath);
  const topIndex = chain.findIndex((a) => excludes.includes(ruleFor(a, true)));
  const top = chain[topIndex];
  const next = excludes.filter((g) => g !== ruleFor(top, true));
  const path = [...chain.slice(topIndex), entry.relPath];
  for (let i = 0; i < path.length - 1; i++) {
    const keep = path[i + 1];
    for (const sibling of childrenOf(path[i]) ?? []) {
      if (sibling.relPath === keep) continue;
      const rule = ruleFor(sibling.relPath, sibling.isDir);
      if (!next.includes(rule)) next.push(rule);
    }
  }
  return joinRules(patterns, next.filter((g) => g !== own), includes);
}
