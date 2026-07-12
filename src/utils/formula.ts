export interface FormulaContext {
  t: number;
  v1: number;
  v2: number;
}

type Token =
  | { type: 'number'; value: number }
  | { type: 'identifier'; value: string }
  | { type: 'operator'; value: '+' | '-' | '*' | '/' | '^' }
  | { type: 'leftParen' }
  | { type: 'rightParen' }
  | { type: 'comma' }
  | { type: 'eof' };

type ExpressionNode =
  | { type: 'number'; value: number }
  | { type: 'variable'; name: string }
  | { type: 'unary'; operator: '+' | '-'; operand: ExpressionNode }
  | {
      type: 'binary';
      operator: '+' | '-' | '*' | '/' | '^';
      left: ExpressionNode;
      right: ExpressionNode;
    }
  | { type: 'call'; name: string; args: ExpressionNode[] };

const VARIABLE_NAMES = new Set(['t', 'v1', 'v2', 'min', 'max', 'start', 'end']);
const FUNCTION_ARITY: Record<string, number> = {
  log10: 1,
  ln: 1,
  log: 1,
  exp: 1,
  pow: 2,
  sqrt: 1,
  abs: 1
};

const expressionCache = new Map<string, ExpressionNode>();

export class FormulaSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaSyntaxError';
  }
}

export function evaluateAxisFormula(formula: string, context: FormulaContext): number {
  const expression = compileAxisFormula(formula);
  return evaluateNode(expression, context);
}

export function compileAxisFormula(formula: string): ExpressionNode {
  const normalized = formula.trim();
  if (!normalized) {
    throw new FormulaSyntaxError('公式不能为空');
  }

  const cached = expressionCache.get(normalized);
  if (cached) return cached;

  const parser = new FormulaParser(tokenize(normalized));
  const expression = parser.parse();
  expressionCache.set(normalized, expression);
  return expression;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      const match = input.slice(index).match(/^(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:e[+-]?\d+)?/i);
      if (!match) throw new FormulaSyntaxError(`无法解析数字，位置 ${index + 1}`);
      const value = Number(match[0]);
      if (!Number.isFinite(value)) throw new FormulaSyntaxError('数字超出有效范围');
      tokens.push({ type: 'number', value });
      index += match[0].length;
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const match = input.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (!match) throw new FormulaSyntaxError(`无法解析标识符，位置 ${index + 1}`);
      tokens.push({ type: 'identifier', value: match[0] });
      index += match[0].length;
      continue;
    }

    if (char === '(') tokens.push({ type: 'leftParen' });
    else if (char === ')') tokens.push({ type: 'rightParen' });
    else if (char === ',') tokens.push({ type: 'comma' });
    else if (char === '+' || char === '-' || char === '*' || char === '/' || char === '^') {
      tokens.push({ type: 'operator', value: char });
    } else {
      throw new FormulaSyntaxError(`不允许的字符“${char}”，位置 ${index + 1}`);
    }
    index += 1;
  }

  tokens.push({ type: 'eof' });
  return tokens;
}

class FormulaParser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): ExpressionNode {
    const expression = this.parseAdditive();
    if (this.current().type !== 'eof') {
      throw new FormulaSyntaxError('公式末尾存在无法解析的内容');
    }
    return expression;
  }

  private parseAdditive(): ExpressionNode {
    let left = this.parseMultiplicative();
    while (this.isOperator('+') || this.isOperator('-')) {
      const operator = (this.consume() as Extract<Token, { type: 'operator' }>).value;
      const right = this.parseMultiplicative();
      left = { type: 'binary', operator, left, right };
    }
    return left;
  }

  private parseMultiplicative(): ExpressionNode {
    let left = this.parseUnary();
    while (this.isOperator('*') || this.isOperator('/')) {
      const operator = (this.consume() as Extract<Token, { type: 'operator' }>).value;
      const right = this.parseUnary();
      left = { type: 'binary', operator, left, right };
    }
    return left;
  }

  private parseUnary(): ExpressionNode {
    if (this.isOperator('+') || this.isOperator('-')) {
      const operator = (this.consume() as Extract<Token, { type: 'operator' }>).value as '+' | '-';
      return { type: 'unary', operator, operand: this.parseUnary() };
    }
    return this.parsePower();
  }

  private parsePower(): ExpressionNode {
    const left = this.parsePrimary();
    if (!this.isOperator('^')) return left;
    this.consume();
    return { type: 'binary', operator: '^', left, right: this.parseUnary() };
  }

  private parsePrimary(): ExpressionNode {
    const token = this.consume();
    if (token.type === 'number') return { type: 'number', value: token.value };

    if (token.type === 'identifier') {
      if (this.current().type === 'leftParen') {
        if (!(token.value in FUNCTION_ARITY)) {
          throw new FormulaSyntaxError(`不允许的函数“${token.value}”`);
        }
        this.consume();
        const args: ExpressionNode[] = [];
        if (this.current().type !== 'rightParen') {
          args.push(this.parseAdditive());
          while (this.current().type === 'comma') {
            this.consume();
            args.push(this.parseAdditive());
          }
        }
        this.expect('rightParen', '函数缺少右括号');
        const expectedArity = FUNCTION_ARITY[token.value];
        if (args.length !== expectedArity) {
          throw new FormulaSyntaxError(
            `函数“${token.value}”需要 ${expectedArity} 个参数，实际为 ${args.length} 个`
          );
        }
        return { type: 'call', name: token.value, args };
      }

      if (!VARIABLE_NAMES.has(token.value)) {
        throw new FormulaSyntaxError(`不允许的变量“${token.value}”`);
      }
      return { type: 'variable', name: token.value };
    }

    if (token.type === 'leftParen') {
      const expression = this.parseAdditive();
      this.expect('rightParen', '表达式缺少右括号');
      return expression;
    }

    throw new FormulaSyntaxError('公式结构不完整');
  }

  private expect(type: Token['type'], message: string): void {
    if (this.current().type !== type) throw new FormulaSyntaxError(message);
    this.consume();
  }

  private isOperator(operator: Extract<Token, { type: 'operator' }>['value']): boolean {
    const token = this.current();
    return token.type === 'operator' && token.value === operator;
  }

  private current(): Token {
    return this.tokens[this.index] ?? { type: 'eof' };
  }

  private consume(): Token {
    const token = this.current();
    this.index += 1;
    return token;
  }
}

function evaluateNode(node: ExpressionNode, context: FormulaContext): number {
  const variables: Record<string, number> = {
    t: context.t,
    v1: context.v1,
    v2: context.v2,
    min: Math.min(context.v1, context.v2),
    max: Math.max(context.v1, context.v2),
    start: context.v1,
    end: context.v2
  };

  switch (node.type) {
    case 'number':
      return node.value;
    case 'variable':
      return variables[node.name];
    case 'unary': {
      const value = evaluateNode(node.operand, context);
      return node.operator === '-' ? -value : value;
    }
    case 'binary': {
      const left = evaluateNode(node.left, context);
      const right = evaluateNode(node.right, context);
      if (node.operator === '+') return left + right;
      if (node.operator === '-') return left - right;
      if (node.operator === '*') return left * right;
      if (node.operator === '/') return left / right;
      return Math.pow(left, right);
    }
    case 'call': {
      const args = node.args.map((arg) => evaluateNode(arg, context));
      if (node.name === 'log10') return Math.log10(args[0]);
      if (node.name === 'ln' || node.name === 'log') return Math.log(args[0]);
      if (node.name === 'exp') return Math.exp(args[0]);
      if (node.name === 'pow') return Math.pow(args[0], args[1]);
      if (node.name === 'sqrt') return Math.sqrt(args[0]);
      return Math.abs(args[0]);
    }
  }
}
