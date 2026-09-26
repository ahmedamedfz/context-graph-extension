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
 * Uses regex-based parsing (no full Java AST required for hackathon).
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
        // Extract class-level @RequestMapping
        const classMapping = this.extractClassMapping(content);
        // Extract all handler methods
        const lines = content.split('\n');
        const methods = this.extractHandlerMethods(lines, classMapping, controllerName);
        endpoints.push(...methods);
        return endpoints;
    }
    extractClassMapping(content) {
        const match = content.match(/@RequestMapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/);
        return match ? match[1] : '';
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
                // Extract path from annotation
                const annotationPath = this.extractAnnotationPath(line, lines, i);
                const fullPath = this.joinPaths(classPath, annotationPath);
                // Look ahead for method signature
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
            // Also handle @RequestMapping on methods
            if (/@RequestMapping\s*\(/.test(line)) {
                const httpMethod = this.extractRequestMappingMethod(line);
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
        // Check current line for path in annotation
        let annotationText = line;
        // If annotation spans multiple lines, collect them
        if (line.includes('(') && !line.includes(')')) {
            for (let j = index + 1; j < Math.min(index + 5, lines.length); j++) {
                annotationText += ' ' + lines[j].trim();
                if (lines[j].includes(')'))
                    break;
            }
        }
        // Try to extract path value
        const patterns = [
            /(?:value\s*=\s*)?["']([^"']+)["']/,
            /\{\s*["']([^"']+)["']/,
        ];
        for (const p of patterns) {
            const m = annotationText.match(p);
            if (m)
                return m[1];
        }
        return '';
    }
    extractRequestMappingMethod(line) {
        const m = line.match(/method\s*=\s*RequestMethod\.(\w+)/);
        if (!m)
            return null;
        const method = m[1].toUpperCase();
        if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
            return method;
        }
        return null;
    }
    extractMethodSignature(lines, annotationIndex) {
        // Look at lines after the annotation for the method signature
        for (let i = annotationIndex + 1; i < Math.min(annotationIndex + 10, lines.length); i++) {
            const line = lines[i].trim();
            // Skip other annotations
            if (line.startsWith('@'))
                continue;
            if (line.length === 0)
                continue;
            // Try to parse method signature
            // e.g.: public ResponseEntity<OrderResponse> createOrder(@RequestBody OrderRequest request)
            const methodMatch = line.match(/(?:public|protected|private)?\s+(?:[\w<>\[\],\s]+)\s+(\w+)\s*\(/);
            if (methodMatch) {
                const name = methodMatch[1];
                const responseModel = this.extractResponseType(line);
                const requestModel = this.extractRequestBodyType(line);
                return { name, requestModel, responseModel };
            }
        }
        return { name: 'unknown' };
    }
    extractResponseType(methodLine) {
        // ResponseEntity<Foo> or List<Foo> or Foo
        const m = methodLine.match(/ResponseEntity\s*<([^>]+)>/);
        if (m)
            return this.cleanGenericType(m[1]);
        const m2 = methodLine.match(/(?:public|protected|private)\s+([\w<>\[\]]+)\s+\w+\s*\(/);
        if (m2 && !['void', 'String', 'boolean', 'int', 'long'].includes(m2[1])) {
            return this.cleanGenericType(m2[1]);
        }
        return undefined;
    }
    extractRequestBodyType(methodLine) {
        const m = methodLine.match(/@RequestBody\s+(\w+)/);
        return m ? m[1] : undefined;
    }
    cleanGenericType(type) {
        return type.replace(/\s/g, '').trim();
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
        try {
            const walk = (current) => {
                const entries = fs.readdirSync(current, { withFileTypes: true });
                for (const entry of entries) {
                    if (entry.name === 'target' || entry.name === '.git' || entry.name === 'node_modules')
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