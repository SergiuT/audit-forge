import { parse } from '@yarnpkg/lockfile';
import { parse as parseYaml } from 'yaml';
import { DependencyType, LockfileEcosystem } from '../types/types';

export function parseYarnLock(content: string) {
    const parsed = parse(content);
    return Object.keys(parsed.object).map((key) => {
      const { version } = parsed.object[key];
      const name = key.split('@')[0]; // crude fallback
      return {
        name,
        version,
        ecosystem: LockfileEcosystem.YARN,
        dependencyType: DependencyType.PROD,
      };
    });
}

export function parsePnpmLock(content: string) {
    const data = parseYaml(content);
  
    const deps: {
      name: string;
      version: string;
      ecosystem: LockfileEcosystem.PNPM;
      dependencyType: DependencyType;
    }[] = [];
  
    const importer = data.importers?.['.'];
    if (!importer) return deps;
  
    const depGroups = [
      { group: importer.dependencies, type: DependencyType.PROD },
      { group: importer.devDependencies, type: DependencyType.DEV },
      { group: importer.optionalDependencies, type: DependencyType.PROD },
    ];
  
    for (const { group, type } of depGroups) {
      if (!group) continue;
      for (const [name, versionRange] of Object.entries(group)) {
        deps.push({
          name,
          version: typeof versionRange === 'string'
            ? versionRange.replace(/^[^\d]*/, '')
            : 'unknown',
          ecosystem: LockfileEcosystem.PNPM,
          dependencyType: type,
        });
      }
    }
  
    return deps;
}

export function parseExpiration(exp: string): number {
  if (/^\d+$/.test(exp)) {
    // If it's just a number, treat as seconds
    return parseInt(exp, 10) * 1000;
  }
  const match = exp.match(/^(\d+)([smhd])$/);
  if (!match) throw new Error('Invalid expiration format');
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: throw new Error('Invalid expiration unit');
  }
}