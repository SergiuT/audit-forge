import { Injectable } from "@nestjs/common";
import { ScannedDependency } from "../entities/scanned-dependency.entity";
import { ComplianceReport } from "@/modules/compliance/entities/compliance-report.entity";
import { Repository } from "typeorm";
import { parsePnpmLock, parseYarnLock } from "../../../shared/utils/parse-lockfiles.util";
import { DependencyType, LockfileEcosystem } from "../../../shared/types/types";

@Injectable()
export class DependencyScannerService {
    constructor(
        private readonly dependencyRepo: Repository<ScannedDependency>,
    ) { }

    async parseAndStoreDependencies({
        report,
        lockFileContent,
        filename,
    }: {
        report: ComplianceReport;
        lockFileContent: string;
        filename: string;
    }): Promise<ScannedDependency[]> {
        let deps: {
            name: string;
            version: string;
            ecosystem: LockfileEcosystem;
            dependencyType: DependencyType;
        }[] = [];

        if (filename === 'package-lock.json') {
            const parsed = JSON.parse(lockFileContent);
            const dependencies = parsed.dependencies || {};
            deps = Object.keys(dependencies).map((name) => ({
                name,
                version: dependencies[name].version,
                ecosystem: LockfileEcosystem.NPM,
                dependencyType: DependencyType.PROD,
            }));
        }

        if (filename === 'yarn.lock') {
            const parsed = parseYarnLock(lockFileContent);
            deps = parsed;
        }

        if (filename === 'pnpm-lock.yaml') {
            const parsed = parsePnpmLock(lockFileContent);
            deps = parsed;
        }

        const saved = await this.dependencyRepo.save(
            deps.map((d) => ({
                ...d,
                report,
                parsedFrom: filename,
            })),
        );

        return saved;
    }
}