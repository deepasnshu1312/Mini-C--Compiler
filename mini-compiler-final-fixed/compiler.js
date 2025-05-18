// --- Tokenizer ---
function tokenize(input) {
    const tokenSpecs = [
        [/^\/\/.*/, null],                     // Single-line comments
        [/^\/\*[\s\S]*?\*\//, null],          // Multi-line comments
        [/^#include\s*<[^>]+>/, 'INCLUDE'],   // Include directives
        [/^\b(int|float|double|char|string|void|bool|if|else|while|for|do|return|break|continue|cout|cin|endl|class|struct|public|private|protected|new|delete|true|false|auto|const|static|namespace|using)\b/, 'KEYWORD'],
        [/^[a-zA-Z_]\w*/, 'IDENTIFIER'],
        [/^\d+\.?\d*([eE][+-]?\d+)?/, 'NUMBER'],
        [/^'([^'\\]|\\.)'/, 'CHAR'],
        [/^"([^"\\]|\\.)*"/, 'STRING'],
        [/^<<|^>>/, 'STREAM'],
        [/^\+\+|^--/, 'OPERATOR'],
        [/^==|^!=|^<=|^>=|^&&|^\|\||^->|^\./, 'OPERATOR'],
        [/^[+\-*/=<>!%&|~^]/, 'OPERATOR'],
        [/^::/, 'SCOPE'],
        [/^[\[\](){};,:]/, 'DELIMITER'],
        [/^\s+/, null]
    ];

    let tokens = [];
    let position = 0;
    input = input.replace(/\r\n/g, '\n').replace(/[\u200B-\u200D\uFEFF]/g, '');

    while (position < input.length) {
        let matched = false;
        const substring = input.slice(position);

        for (const [regex, type] of tokenSpecs) {
            const match = regex.exec(substring);
            if (match) {
                if (type !== null) {
                    tokens.push({ type, value: match[0] });
                }
                position += match[0].length;
                matched = true;
                break;
            }
        }

        if (!matched) {
            throw new Error(`Syntax error at position ${position}: '${input[position]}'`);
        }
    }

    return tokens;
}

// --- Parser ---
function parseTokens(tokens) {
    let i = 0;
    const symbolTable = {};

    function current() {
        return tokens[i];
    }

    function next() {
        i++;
    }

    function peek() {
        return tokens[i + 1];
    }

    function expect(type, value = null) {
        const t = current();
        if (!t || t.type !== type || (value !== null && t.value !== value)) {
            throw new Error(`Expected ${type} '${value}', got '${t ? t.value : 'EOF'}'`);
        }
        next();
        return t;
    }

    const PRECEDENCE = {
    '=': 0,
    '||': 1,
    '&&': 2,
    '|': 3,
    '^': 4,
    '&': 5,
    '==': 6, '!=': 6,
    '<': 7, '<=': 7, '>': 7, '>=': 7,
    '<<': 8, '>>': 8,
    '+': 9, '-': 9,
    '*': 10, '/': 10, '%': 10,
    '.': 11, '->': 11, '::': 11
};


    function parseExpression(minPrecedence = 1) {
    let left = parsePrimary();

    while (
        current() &&
        (current().type === 'OPERATOR' || current().type === 'SCOPE') &&
        PRECEDENCE.hasOwnProperty(current().value) &&
        PRECEDENCE[current().value] >= minPrecedence
    ) {
        const op = current().value;
        const precedence = PRECEDENCE[op];
        next();
        let right = parseExpression(op === '=' ? precedence : precedence + 1);  // right-associative for '='
        left = `(${left} ${op} ${right})`;
    }

    return left;
}


    function parsePrimary() {
    const token = current();
    if (!token) throw new Error("Unexpected end of input in expression");

    // Handle prefix operators
    if (token.type === "OPERATOR" && (token.value === "++" || token.value === "--" || 
                                     token.value === "+" || token.value === "-" || 
                                     token.value === "!" || token.value === "~")) {
        const op = token.value;
        next();
        const operand = parsePrimary();
        return `(${op}${operand})`;
    }

     // Accept numbers, strings, chars, true/false, and endl
 if (
     token.type === 'NUMBER' ||
     token.type === 'STRING' ||
     token.type === 'CHAR'    ||
     (token.type === 'KEYWORD' && ['true','false','endl'].includes(token.value))
 ) {
     const value = token.value;
     next();
     // turn endl into a newline literal
     if (value === 'endl') return '"\\n"';
     return value;
 }


    if (token.type === 'IDENTIFIER') {
        const value = token.value;
        next();

        // Handle assignment: x = expr
        if (current() && current().type === 'OPERATOR' && current().value === '=') {
            const op = current().value;
            next();
            const right = parseExpression(PRECEDENCE[op]);
            return `(${value} ${op} ${right})`;
        }

        // Handle postfix ++ / --
        if (current() && current().type === "OPERATOR" && (current().value === "++" || current().value === "--")) {
            const op = current().value;
            next();
            return `(${value}${op})`;
        }

        // Function call
        if (current() && current().value === '(') {
            next();
            const args = [];
            while (current() && current().value !== ')') {
                args.push(parseExpression());
                if (current().value === ',') next();
            }
            expect("DELIMITER", ")");
            return `${value}(${args.join(', ')})`;
        }

        // Member access
        if (current() && (current().value === '.' || current().value === '->')) {
            const op = current().value;
            next();
            const member = expect("IDENTIFIER").value;
            return `(${value}${op}${member})`;
        }

        return value;
    }

    if (token.value === '(') {
        next();
        const expr = parseExpression();
        expect("DELIMITER", ")");
        return `(${expr})`;
    }

    if (token.value === '[') {
        next();
        const expr = parseExpression();
        expect("DELIMITER", "]");
        return `[${expr}]`;
    }

    if (token.type === 'KEYWORD' && token.value === 'new') {
        next();
        const type = expect("IDENTIFIER").value;
        if (current().value === '[') {
            next();
            const size = parseExpression();
            expect("DELIMITER", "]");
            return `new ${type}[${size}]`;
        } else {
            return `new ${type}()`;
        }
    }

    throw new Error(`Unexpected token in expression: ${token.value}`);
}


    function parseType() {
        let type = '';
        // Handle const, static modifiers
        while (current().type === 'KEYWORD' && (current().value === 'const' || current().value === 'static')) {
            type += current().value + ' ';
            next();
        }
        
        // Base type
        if (current().type === 'KEYWORD') {
            type += expect("KEYWORD").value;
        } else {
            type += expect("IDENTIFIER").value;
        }
        
        // Pointer/reference
        while (current().value === '*' || current().value === '&') {
            type += current().value;
            next();
        }
        
        return type;
    }

    function parseParameterList() {
        const params = [];
        expect("DELIMITER", "(");
        
        while (current() && current().value !== ')') {
            const type = parseType();
            const name = expect("IDENTIFIER").value;
            params.push({ type, name });
            
            if (current().value === ',') {
                next();
            }
        }
        
        expect("DELIMITER", ")");
        return params;
    }

    function parseDeclaration() {
        const type = parseType();
        const name = expect("IDENTIFIER").value;
        symbolTable[name] = type;

        // Function declaration
        if (current().value === '(') {
            const params = parseParameterList();
            
            // Function definition
            if (current().value === '{') {
                const body = parseBlock();
                return { type: "function", returnType: type, name, params, body };
            }
            // Function declaration only
            else {
                expect("DELIMITER", ";");
                return { type: "functionDecl", returnType: type, name, params };
            }
        }
        // Variable declaration
        else {
            let value = null;
            if (current().value === '=') {
                next();
                value = parseExpression();
            }
            expect("DELIMITER", ";");
            return { type: "declaration", varType: type, name, value };
        }
    }

    function parseBlock() {
        expect("DELIMITER", "{");
        const body = [];
        while (current() && current().value !== "}") {
            body.push(parseStatement());
        }
        expect("DELIMITER", "}");
        return { type: "block", body };
    }

    function parseStatement() {
        const t = current();
        if (!t) throw new Error("Unexpected EOF");

        if (t.value === "{") {
            return parseBlock();
        }

        if (t.type === "INCLUDE") {
            const include = expect("INCLUDE").value;
            return { type: "include", value: include };
        }

        if (t.type === "KEYWORD") {
            switch (t.value) {
                case "int":
                case "float":
                case "double":
                case "char":
                case "bool":
                case "void":
                case "const":
                case "static":
                case "auto":
                    return parseDeclaration();

                case "cin": {
                    expect("KEYWORD", "cin");
                    const inputs = [];
                    while (current() && current().type === "STREAM" && current().value === ">>") {
                        expect("STREAM", ">>");
                        const v = parseExpression();
                        inputs.push(v);
                    }
                    expect("DELIMITER", ";");
                    return { type: "input", inputs };
                }

                case "cout": {
                    expect("KEYWORD", "cout");
                    const parts = [];
                    while (current() && current().value !== ';') {
                        if (current().type === "STREAM" && current().value === "<<") {
                            expect("STREAM", "<<");
                            let expr = parseExpression();
                            parts.push(expr);
                        } else if (current().type === "KEYWORD" && current().value === "endl") {
                            next();
                            parts.push('"\\n"');
                        } else {
                            throw new Error(`Expected '<<' or 'endl' in cout, got '${current().value}'`);
                        }
                    }
                    expect("DELIMITER", ";");
                    return { type: "print", parts };
                }

                case "if": {
                    expect("KEYWORD", "if");
                    expect("DELIMITER", "(");
                    const condition = parseExpression();
                    expect("DELIMITER", ")");
                    const thenStmt = parseStatement();
                    let elseStmt = null;
                    if (current() && current().type === "KEYWORD" && current().value === "else") {
                        expect("KEYWORD", "else");
                        elseStmt = parseStatement();
                    }
                    return { type: "if", condition, thenStmt, elseStmt };
                }

                case "while": {
                    expect("KEYWORD", "while");
                    expect("DELIMITER", "(");
                    const condition = parseExpression();
                    expect("DELIMITER", ")");
                    const body = parseStatement();
                    return { type: "while", condition, body };
                }

                case "do": {
                    expect("KEYWORD", "do");
                    const body = parseStatement();
                    expect("KEYWORD", "while");
                    expect("DELIMITER", "(");
                    const condition = parseExpression();
                    expect("DELIMITER", ")");
                    expect("DELIMITER", ";");
                    return { type: "doWhile", condition, body };
                }

                case "for": {
                    expect("KEYWORD", "for");
                    expect("DELIMITER", "(");
                    let init = null;
                    if (current().value !== ";") {
                        init = parseStatement();
                    } else {
                        next(); // skip empty init
                    }
                    let condition = "true";
                    if (current().value !== ";") {
                        condition = parseExpression();
                    }
                    expect("DELIMITER", ";");
                    let update = null;
                    if (current().value !== ")") {
                        update = parseExpression();
                    }
                    expect("DELIMITER", ")");
                    const body = parseStatement();
                    return { type: "for", init, condition, update, body };
                }

                case "return": {
                    expect("KEYWORD", "return");
                    let value = null;
                    if (current().value !== ";") {
                        value = parseExpression();
                    }
                    expect("DELIMITER", ";");
                    return { type: "return", value };
                }

                case "break": {
                    expect("KEYWORD", "break");
                    expect("DELIMITER", ";");
                    return { type: "break" };
                }

                case "continue": {
                    expect("KEYWORD", "continue");
                    expect("DELIMITER", ";");
                    return { type: "continue" };
                }

                default:
                    throw new Error(`Unsupported keyword: ${t.value}`);
            }
        }

        // Try to parse as expression statement
        try {
    const expr = parseExpression();

    // Type check basic assignments
    const assignMatch = /^\((\w+)\s*=\s*(.+)\)$/.exec(expr);
    if (assignMatch) {
        const varName = assignMatch[1];
        const rhs = assignMatch[2];
        const declaredType = symbolTable[varName];

        if (!declaredType) throw new Error(`Undeclared variable '${varName}'`);
        
        if ((declaredType === 'int' || declaredType === 'float') && /^".*"$/.test(rhs)) {
            throw new Error(`Type error: cannot assign string to ${declaredType} '${varName}'`);
        }
        // Disallow assigning float literals to int
        if (declaredType === 'int' && /^\\d+\\.\\d+$/.test(rhs)) {
            throw new Error(`Type error: cannot assign float to int '${varName}'`);
        }
        if (declaredType === 'string' && /^\d+(\.\d+)?$/.test(rhs)) {
            throw new Error(`Type error: cannot assign number to string '${varName}'`);
        }
    }

    expect("DELIMITER", ";");
    return { type: "expression", expression: expr };
} catch (e) {
    throw new Error(`Invalid statement: ${t.value}`);
}

    }

    const ast = [];
    while (i < tokens.length) {
        ast.push(parseStatement());
    }
    return ast;
}

// --- Code Generator ---
function generateJS(ast, inputBuffer = [], isTopLevel = true) {
    let code = '';
    let includes = [];
    
    // First pass for includes and function declarations
    for (const node of ast) {
        if (node.type === "include") {
            includes.push(node.value);
        } else if (node.type === "functionDecl") {
            code += `function ${node.name}(${node.params.map(p => p.name).join(', ')}) { throw "${node.name} not implemented"; }\n`;
        }
    }
    
    if (isTopLevel) {
        code += "const __input = [...arguments[0]];\n";
        code += "function __inputProvider() { if (__input.length === 0) throw 'No more input'; return __input.shift(); }\n";
        code += "let __outputs = [];\n";
        
        // Check for main function
        const hasMain = ast.some(node => node.type === "function" && node.name === "main");
        if (!hasMain) {
            code += "function main() {\n";
        }
    }
    
    // Second pass for actual code generation
    for (const node of ast) {
        switch (node.type) {
            case "include":
                // Handled in first pass
                break;
                
            case "declaration":
                code += `let ${node.name}`;
                if (node.value !== null) {
                    code += ` = ${node.value}`;
                }
                code += `;\n`;
                break;
                
            case "function":
                code += `function ${node.name}(${node.params.map(p => p.name).join(', ')}) {\n`;
                code += generateJS(node.body, inputBuffer, false);
                code += `}\n`;
                break;
                
            case "input":
                for (const v of node.inputs) {
                    code += `${v} = Number(__inputProvider());\n`;
                }
                break;
                
            case "print":
                code += `__outputs.push(${node.parts.join(" + ' ' + ")});\n`;
                break;
                
            case "if":
                code += `if (${node.condition}) {\n`;
                code += generateJS([node.thenStmt], inputBuffer, false);
                code += `}\n`;
                if (node.elseStmt) {
                    code += `else {\n`;
                    code += generateJS([node.elseStmt], inputBuffer, false);
                    code += `}\n`;
                }
                break;
                
            case "while":
                code += `while (${node.condition}) {\n`;
                code += generateJS([node.body], inputBuffer, false);
                code += `}\n`;
                break;
                
            case "doWhile":
                code += `do {\n`;
                code += generateJS([node.body], inputBuffer, false);
                code += `} while (${node.condition});\n`;
                break;
                
            case "for":
                code += `{\n`;
                if (node.init) {
                    code += generateJS([node.init], inputBuffer, false);
                }
                code += `while (${node.condition}) {\n`;
                code += generateJS([node.body], inputBuffer, false);
                if (node.update) {
                    code += `${node.update};\n`;
                }
                code += `}\n}\n`;
                break;
                
            case "return":
                if (node.value !== null) {
                    code += `return ${node.value};\n`;
                } else {
                    code += `return;\n`;
                }
                break;
                
            case "break":
                code += `break;\n`;
                break;
                
            case "continue":
                code += `continue;\n`;
                break;
                
            case "block":
                code += `{\n`;
                for (const stmt of node.body) {
                    code += generateJS([stmt], inputBuffer, false);
                }
                code += `}\n`;
                break;
                
            case "expression":
                code += `${node.expression};\n`;
                break;
        }
    }
    
    if (isTopLevel) {
        const hasMain = ast.some(node => node.type === "function" && node.name === "main");
        if (!hasMain) {
            code += "}\n";
            code += "main();\n";
        } else {
            code += "main();\n";
        }
        code += "return __outputs.join('');\n";
    }
    
    return code;
}

// --- Run the JS ---
function runJS(jsCode, inputs) {
    try {
        const runner = new Function(jsCode);
        return runner(inputs);
    } catch (e) {
        return "Runtime error: " + e.message;
    }
}

// --- Main Driver ---
function compileAndRun() {
    const code = document.getElementById("code").value;
    const userInput = document.getElementById("userInput").value;
    const inputs = userInput.trim().split(/\s+/).filter(v => v.length > 0);

    try {
        const tokens = tokenize(code);
        const ast = parseTokens(tokens);
        const jsCode = generateJS(ast, inputs);
        console.log(jsCode); // For debugging
        const output = runJS(jsCode, inputs);
        document.getElementById("output").textContent = output;
    } catch (e) {
        document.getElementById("output").textContent = "Error: " + e.message;
    }
}