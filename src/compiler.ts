import { AST, TYPE } from './parser';


/**
 * Compiler compiles the AST tree to generate a function
 */
export class Compiler {
  private state: {
    id: number;
    vars: string[];
    body: string[];
  };

  constructor() { }

  compile(ast: AST): Function {
    this.state = {
      id: 0,
      vars: [],
      body: []
    };
    this.recurse(ast);
    const fnBody = 'return function(ctx){' +
      (this.state.vars.length ?
        'var ' + this.state.vars.join(',') + ';' :
        ''
      ) +
      this.state.body.join('') +
      '}';
    return new Function('ensureSafeFn', fnBody)(this.ensureSafeFn);
  }

  recurse(ast: AST, setCallContext?: Function): string {
    let variable: string;
    switch (ast.type) {
      case TYPE.Program:
        const len = ast.body.length;
        for (let i = 0; i < len - 1; i++) {
          this.state.body.push(this.recurse(ast.body[i]), ';');
        }
        this.state.body.push('return ', this.recurse(ast.body[len - 1]), ';');
        break;
      case TYPE.ConditionalExpression:
        variable = this.variableDeclaration();
        const testVariable = this.variableDeclaration();
        this.state.body.push(
          this.assign(
            testVariable,
            this.recurse(ast.test)
          )
        );
        this.state.body.push(
          this.if_(
            testVariable,
            this.assign(
              variable,
              this.recurse(ast.consequent)
            )
          )
        );
        this.state.body.push(
          this.if_(
            this.not(testVariable),
            this.assign(
              variable,
              this.recurse(ast.alternate)
            )
          )
        );
        return variable;
      case TYPE.LogicalExpression:
        variable = this.variableDeclaration();
        this.state.body.push(
          this.assign(
            variable,
            this.recurse(ast.left)
          )
        );
        this.state.body.push(
          this.if_(
            ast.operator === '&&' ? variable : this.not(variable),
            this.assign(
              variable,
              this.recurse(ast.right)
            )
          )
        );
        return variable;
      case TYPE.BinaryExpression:
        return '(' + this.recurse(ast.left) + ')' + ast.operator + '(' + this.recurse(ast.right) + ')';
      case TYPE.UnaryExpression:
        return ast.operator + '(' + this.recurse(ast.argument) + ')';
      case TYPE.CallExpression:
        let callContext = 'ctx';
        const callee = this.recurse(ast.callee, (context: string) => {
          callContext = context;
        });
        const args = ast.arguments.map(arg => this.recurse(arg));
        this.state.body.push('ensureSafeFn(' + callee + ');');
        return callee + '&&' + callee + '.call(' + callContext +
          (args.length > 0 ?
            ',' + args.join(',') :
            ''
          ) + ')';
      case TYPE.MemberExpression:
        variable = this.variableDeclaration();
        const left = this.recurse(ast.object);
        const right = ast.computed ? this.recurse(ast.property) : (ast.property as any).name;
        if (setCallContext) {
          setCallContext(left);
        }
        this.state.body.push(
          this.if_(
            left,
            this.assign(
              variable,
              this.member(
                left,
                right,
                ast.computed
              )
            )
          )
        );
        return variable;
      case TYPE.ArrayExpression:
        const elements = [];
        for (let i = 0; i < ast.elements.length; i++) {
          if (ast.elements[i]) {
            elements[i] = this.recurse(ast.elements[i]);
          }
        }
        return '[' + elements.join(',') + ']';
      case TYPE.ObjectExpression:
        const properties = ast.properties.map(property => {
          const key = property.key.type === TYPE.Identifier ? property.key.name : this.recurse(property.key);
          const value = this.recurse(property.value);
          return key + ':' + value;
        });
        return '{' + properties.join(',') + '}';
      case TYPE.Identifier:
        variable = this.variableDeclaration();
        this.state.body.push(
          this.if_(
            'ctx',
            this.assign(
              variable,
              this.member(
                'ctx',
                ast.name
              )
            )
          )
        );
        return variable;
      case TYPE.Literal:
        if (typeof ast.value === 'string') {
          return `'${ast.value}'`;
        }
        return '' + ast.value;
    }
  }

  variableDeclaration(): string {
    const variable = 'v' + this.state.id++;
    this.state.vars.push(variable);
    return variable;
  }

  if_(test: string, consequent: string): string {
    return 'if(' + test + '){' + consequent + '}';
  }

  not(e: string): string {
    return '!(' + e + ')';
  }

  assign(left: string, right: string): string {
    return left + '=' + right + ';';
  }

  member(left: string, right: string, computed?: boolean): string {
    if (computed) {
      return '(' + left + ')[' + right + ']';
    }
    return '(' + left + ').' + right;
  }

  ensureSafeFn(callee: any) {
    if (typeof callee === 'function' && callee === Function) {
      throw('calling the function constructor is not allowed!');
    }
  }
}