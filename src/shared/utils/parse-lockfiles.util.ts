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