"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DependencyAnalyzer = void 0;
const ComposeDependencies_1 = require("./ComposeDependencies");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Detects dependencies between Spring Boot services by analyzing:
 * - RestTemplate / WebClient / FeignClient calls
 * - Service references in application.properties/yml
 * - Import patterns
 */
class DependencyAnalyzer {
    /**
     * Detect service dependencies from source code.
     * @param serviceRoot - Root directory of the service being analyzed
     * @param knownServices - IDs of other known services in the workspace
     */
    analyzeDependencies(serviceRoot, knownServices) {
        const dependencies = [];
        const javaFiles = this.findJavaFiles(serviceRoot);
        const restDeps = this.findRestClientDependencies(javaFiles, knownServices, serviceRoot);
        const configDeps = this.findConfigDependencies(serviceRoot, knownServices);
        // Merge, deduplicating by target service
        const merged = new Map();
        for (const dep of [...restDeps, ...configDeps, ...(0, ComposeDependencies_1.polyglotDependencies)(serviceRoot, knownServices)]) {
            const existing = merged.get(`${dep.type}:${dep.targetService}`);
            if (existing) {
                if (dep.endpoints) {
                    existing.endpoints = [...(existing.endpoints || []), ...dep.endpoints];
                }
                existing.evidence += '; ' + dep.evidence;
            }
            else {
                merged.set(`${dep.type}:${dep.targetService}`, { ...dep });
            }
        }
        return Array.from(merged.values());
    }
    findRestClientDependencies(javaFiles, knownServices, serviceRoot) {
        const deps = [];
        for (const file of javaFiles) {
            try {
                const content = fs.readFileSync(file, 'utf8');
                // Look for @FeignClient(name = "inventory-service")
                const feignMatches = [...content.matchAll(/@FeignClient\s*\(\s*(?:name\s*=\s*)?["']([^"']+)["']/g)];
                for (const m of feignMatches) {
                    deps.push({
                        targetService: m[1],
                        type: 'REST',
                        evidence: `FeignClient in ${path.basename(file)}`,
                    });
                }
                // Look for URL patterns like "http://inventory-service/" or "${inventory-service.url}"
                const urlMatches = [...content.matchAll(/["']https?:\/\/([a-z0-9-]+)[/:]["']/g)];
                for (const m of urlMatches) {
                    const svcName = m[1];
                    if (knownServices.some(s => s.includes(svcName) || svcName.includes(s.replace('-service', '')))) {
                        deps.push({
                            targetService: svcName,
                            type: 'REST',
                            evidence: `HTTP call to ${svcName} in ${path.basename(file)}`,
                        });
                    }
                }
                // Look for RestTemplate or WebClient usage with service names
                if (/RestTemplate|WebClient/.test(content)) {
                    for (const svc of knownServices) {
                        const svcBase = decodeURIComponent(svc.split('/').pop()).replace('-service', '');
                        const regex = new RegExp(`["'\`](?:[^"'\`]*${svcBase}[^"'\`]*)["'\`]`, 'gi');
                        if (regex.test(content)) {
                            deps.push({
                                targetService: svc,
                                type: 'REST',
                                evidence: `RestTemplate/WebClient reference to ${svc} in ${path.basename(file)}`,
                            });
                        }
                    }
                }
            }
            catch {
                // skip
            }
        }
        return deps;
    }
    findConfigDependencies(serviceRoot, knownServices) {
        const deps = [];
        const configFiles = [
            path.join(serviceRoot, 'src', 'main', 'resources', 'application.properties'),
            path.join(serviceRoot, 'src', 'main', 'resources', 'application.yml'),
            path.join(serviceRoot, 'src', 'main', 'resources', 'application.yaml'),
        ];
        for (const configFile of configFiles) {
            if (!fs.existsSync(configFile))
                continue;
            try {
                const content = fs.readFileSync(configFile, 'utf8');
                for (const svc of knownServices) {
                    const svcBase = decodeURIComponent(svc.split('/').pop()).replace('-service', '');
                    if (content.includes(svc) || content.includes(svcBase + '.url') || content.includes(svcBase + '-service')) {
                        deps.push({
                            targetService: svc,
                            type: 'REST',
                            evidence: `Configuration reference to ${svc} in ${path.basename(configFile)}`,
                        });
                    }
                }
            }
            catch {
                // skip
            }
        }
        return deps;
    }
    /**
     * Detect which databases a service uses based on configuration and entity presence.
     */
    detectDatabaseUsage(serviceRoot) {
        const databases = [];
        // F08: also check application.yaml (same as .yml but different extension)
        const configFiles = [
            path.join(serviceRoot, 'src', 'main', 'resources', 'application.properties'),
            path.join(serviceRoot, 'src', 'main', 'resources', 'application.yml'),
            path.join(serviceRoot, 'src', 'main', 'resources', 'application.yaml'),
        ];
        for (const configFile of configFiles) {
            if (!fs.existsSync(configFile))
                continue;
            try {
                const content = fs.readFileSync(configFile, 'utf8');
                // Extract database name from JDBC URL: jdbc:postgresql://localhost:5432/orders_db
                const jdbcMatch = content.match(/jdbc:[^:]+:\/\/[^/]+\/([a-zA-Z0-9_-]+)/);
                if (jdbcMatch) {
                    databases.push(jdbcMatch[1]);
                }
                // Spring datasource url pattern
                const urlMatch = content.match(/datasource[.\-]url.*\/([a-zA-Z0-9_-]+)(?:\?|$)/);
                if (urlMatch) {
                    databases.push(urlMatch[1]);
                }
            }
            catch {
                // skip
            }
        }
        // Deduplicate
        return [...new Set(databases)];
    }
    findJavaFiles(dir) {
        const results = [];
        try {
            const walk = (current) => {
                const entries = fs.readdirSync(current, { withFileTypes: true });
                for (const entry of entries) {
                    if (['target', '.git', 'node_modules'].includes(entry.name))
                        continue;
                    const full = path.join(current, entry.name);
                    if (entry.isDirectory())
                        walk(full);
                    else if (entry.name.endsWith('.java'))
                        results.push(full);
                }
            };
            walk(dir);
        }
        catch {
            // ignore
        }
        return results;
    }
}
exports.DependencyAnalyzer = DependencyAnalyzer;
//# sourceMappingURL=DependencyAnalyzer.js.map