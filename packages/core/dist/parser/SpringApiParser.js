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
exports.SpringApiParser = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Parses Spring Boot Java source files to extract REST API endpoints.
 * Uses regex-based parsing with multiline annotation support.
 *
 * F15 fixes:
 * - Handle path= alias in @RequestMapping (not just value=)
 * - Handle @RequestBody on a following line (multiline signatures)
 * - Correctly parse nested generics like ResponseEntity<List<OrderResponse>>
 * - Handle array-style @RequestMapping(value={"/v1"})
 */
class SpringApiParser {
    /**
     * Parse all Java files in a service directory and extract endpoints.
     */
    parseService(serviceRoot) {
        const endpoints = [];
        const javaFiles = this.findJavaFiles(serviceRoot);
        for (const file of javaFiles) {
            try {
                const content = fs.readFileSync(file, 'utf8');
                if (this.isRestController(content)) {
                    const fileEndpoints = this.parseController(file, content);
                    endpoints.push(...fileEndpoints);
                }
            }
            catch {
                // skip unreadable files
            }
        }
        return endpoints;
    }
    isRestController(content) {
        return /@RestController/.test(content) || /@Controller/.test(content);
    }
    parseController(filePath, content) {
        const endpoints = [];
        const controllerName = path.basename(filePath, '.java');
        // Extract class-level @RequestMapping prefix
        const classMapping = this.extractClassMapping(content);
        // Extract all handler methods
        const lines = content.split('\n');
        const methods = this.extractHandlerMethods(lines, classMapping, controllerName);
        endpoints.push(...methods);
        return endpoints;
    }
    /**
     * F15: Extract class-level @RequestMapping, supporting both value= and path= aliases.
     * Also handles array syntax: @RequestMapping({"/v1"}) or @RequestMapping(path={"/v1", "/api/v1"})
     */
    extractClassMapping(content) {
        // Collect the full @RequestMapping annotation block (may span multiple lines)
        const annotMatch = content.match(/@RequestMapping\s*(\([^)]*\))/s);
        if (!annotMatch)
            return '';
        const body = annotMatch[1];
        // Try value= or path= with quoted string
        const aliasMatch = body.match(/(?:value|path)\s*=\s*(?:\{[^}]*\}|["']([^"']+)["'])/);
        if (aliasMatch) {
            if (aliasMatch[1])
                return aliasMatch[1];
            // Array form: pick the first entry
            const arrMatch = body.match(/["']([^"']+)["']/);
            if (arrMatch)
                return arrMatch[1];
        }
        // Bare value: @RequestMapping("/api")
        const bareMatch = body.match(/["']([^"']+)["']/);
        if (bareMatch)
            return bareMatch[1];
        return '';
    }
    extractHandlerMethods(lines, classPath, controllerName) {
        const endpoints = [];
        const httpMethodAnnotations = [
            { pattern: /@GetMapping/, method: 'GET' },
            { pattern: /@PostMapping/, method: 'POST' },
            { pattern: /@PutMapping/, method: 'PUT' },
            { pattern: /@DeleteMapping/, method: 'DELETE' },
            { pattern: /@PatchMapping/, method: 'PATCH' },
        ];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            for (const { pattern, method } of httpMethodAnnotations) {
                if (!pattern.test(line))
                    continue;
                // Extract path from annotation (may span multiple lines)
                const annotationPath = this.extractAnnotationPath(line, lines, i);
                const fullPath = this.joinPaths(classPath, annotationPath);
                // Look ahead for method signature (may be several lines ahead, skipping annotations)
                const methodInfo = this.extractMethodSignature(lines, i);
                endpoints.push({
                    method,
                    path: fullPath || '/',
                    controller: controllerName,
                    handlerMethod: methodInfo.name,
                    requestModel: methodInfo.requestModel,
                    responseModel: methodInfo.responseModel,
                });
                break;
            }
            // Also handle @RequestMapping on methods with explicit method=
            if (/@RequestMapping\s*\(/.test(line)) {
                const httpMethod = this.extractRequestMappingMethod(line, lines, i);
                if (httpMethod) {
                    const annotationPath = this.extractAnnotationPath(line, lines, i);
                    const fullPath = this.joinPaths(classPath, annotationPath);
                    const methodInfo = this.extractMethodSignature(lines, i);
                    endpoints.push({
                        method: httpMethod,
                        path: fullPath || '/',
                        controller: controllerName,
                        handlerMethod: methodInfo.name,
                        requestModel: methodInfo.requestModel,
                        responseModel: methodInfo.responseModel,
                    });
                }
            }
        }
        return endpoints;
    }
    extractAnnotationPath(line, lines, index) {
        // Collect annotation text (may span multiple lines until closing paren)
        let annotationText = line;
        if (line.includes('(') && !line.includes(')')) {
            for (let j = index + 1; j < Math.min(index + 8, lines.length); j++) {
                annotationText += ' ' + lines[j].trim();
                if (lines[j].includes(')'))
                    break;
            }
        }
        // F15: handle path= or value= with quoted string or array
        const aliasMatch = annotationText.match(/(?:value|path)\s*=\s*(?:\{[^}]*\}|["']([^"']+)["'])/);
        if (aliasMatch) {
            if (aliasMatch[1])
                return aliasMatch[1];
            const arrMatch = annotationText.match(/["']([^"']+)["']/);
            if (arrMatch)
                return arrMatch[1];
        }
        // Bare value: @GetMapping("/path")
        const bareMatch = annotationText.match(/\(\s*["']([^"']+)["']/);
        if (bareMatch)
            return bareMatch[1];
        return '';
    }
    extractRequestMappingMethod(line, lines, index) {
        // Collect full annotation block
        let annotText = line;
        if (line.includes('(') && !line.includes(')')) {
            for (let j = index + 1; j < Math.min(index + 8, lines.length); j++) {
                annotText += ' ' + lines[j].trim();
                if (lines[j].includes(')'))
                    break;
            }
        }
        const m = annotText.match(/method\s*=\s*(?:RequestMethod\.)?(\w+)/);
        if (!m)
            return null;
        const method = m[1].toUpperCase();
        if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
            return method;
        }
        return null;
    }
    extractMethodSignature(lines, annotationIndex) {
        // Collect the full method signature (annotation may be followed by more annotations)
        // then the actual Java method declaration — collect up to 15 lines
        let signatureLines = [];
        for (let i = annotationIndex + 1; i < Math.min(annotationIndex + 15, lines.length); i++) {
            const line = lines[i].trim();
            if (line.startsWith('@')) {
                // Another annotation — include it but keep scanning
                signatureLines.push(line);
                continue;
            }
            if (line.length === 0)
                continue;
            // This looks like the method declaration (or continuation)
            signatureLines.push(line);
            // If we have a complete signature (contains '('), stop once we find '{'
            if (line.includes('{') || line.includes(';'))
                break;
        }
        const fullSig = signatureLines.join(' ');
        const methodMatch = fullSig.match(/(?:public|protected|private)?\s+(?:[\w<>\[\],\s]+)\s+(\w+)\s*\(/);
        if (methodMatch) {
            const name = methodMatch[1];
            const responseModel = this.extractResponseType(fullSig);
            // F15: @RequestBody may be on a different line — scan the joined signature
            const requestModel = this.extractRequestBodyType(fullSig);
            return { name, requestModel, responseModel };
        }
        return { name: 'unknown' };
    }
    extractResponseType(methodLine) {
        // F15: handle nested generics like ResponseEntity<List<OrderResponse>>
        const reMatch = methodLine.match(/ResponseEntity\s*<(.+?)>\s+\w+\s*\(/);
        if (reMatch)
            return this.cleanGenericType(reMatch[1]);
        const m2 = methodLine.match(/(?:public|protected|private)\s+([\w<>[\],\s]+)\s+\w+\s*\(/);
        if (m2) {
            const type = m2[1].trim();
            if (!['void', 'String', 'boolean', 'int', 'long'].includes(type)) {
                return this.cleanGenericType(type);
            }
        }
        return undefined;
    }
    extractRequestBodyType(methodLine) {
        // F15: @RequestBody can be on the same line or a preceding annotation line
        const m = methodLine.match(/@RequestBody\s+(?:[\w<>[\]]+\s+)*(\w+)\s+\w+/);
        if (m)
            return m[1];
        // Fallback: simpler match
        const m2 = methodLine.match(/@RequestBody\s+(\w+)/);
        return m2 ? m2[1] : undefined;
    }
    cleanGenericType(type) {
        // Keep nested generics intact, just remove extra whitespace
        return type.replace(/\s+/g, '').trim();
    }
    joinPaths(...parts) {
        const joined = parts
            .filter(p => p)
            .join('/')
            .replace(/\/+/g, '/');
        return joined.startsWith('/') ? joined : '/' + joined;
    }
    findJavaFiles(dir) {
        const results = [];
        const SKIP = new Set(['target', '.git', 'node_modules', 'build', 'dist']);
        try {
            const walk = (current) => {
                const entries = fs.readdirSync(current, { withFileTypes: true });
                for (const entry of entries) {
                    if (SKIP.has(entry.name))
                        continue;
                    const full = path.join(current, entry.name);
                    if (entry.isDirectory()) {
                        walk(full);
                    }
                    else if (entry.name.endsWith('.java')) {
                        results.push(full);
                    }
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
exports.SpringApiParser = SpringApiParser;
//# sourceMappingURL=SpringApiParser.js.map