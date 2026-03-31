/**
 * Identity Profile Generator
 * Aggregate user profiles from scan results
 */

export interface TechStack {
  languages: string[];
  frameworks: string[];
  infra: string[];
  tools: string[];
}

export interface CodeStyle {
  indent: string | null;
  quotes: string | null;
  semicolons: boolean | null;
  trailingComma: string | null;
}

export interface TeamInfo {
  org: string | null;
  platform: string | null;
  communication: string[];
}

export interface CurrentProject {
  name: string | null;
  description: string | null;
  path: string | null;
}

export interface IdentityProfile {
  name: string | null;
  role: string | null;
  email: string | null;
  techStack: TechStack;
  codeStyle: CodeStyle;
  team: TeamInfo;
  currentProject: CurrentProject;
  blockCount: number;
  sources: string[];
}

/**
 * Aggregate user personas from scanned blocks
 */
export function generateProfile(blocks: Array<{ content: string; annotation: string; metadata?: Record<string, unknown> }>): IdentityProfile {
  const profile: IdentityProfile = {
    name: null,
    role: null,
    email: null,
    techStack: {
      languages: [],
      frameworks: [],
      infra: [],
      tools: [],
    },
    codeStyle: {
      indent: null,
      quotes: null,
      semicolons: null,
      trailingComma: null,
    },
    team: {
      org: null,
      platform: null,
      communication: [],
    },
    currentProject: {
      name: null,
      description: null,
      path: null,
    },
    blockCount: blocks.length,
    sources: [],
  };

  const seenSources = new Set<string>();

  for (const block of blocks) {
    // record source
    if (block.metadata?.scan_source) {
      seenSources.add(block.metadata.scan_source as string);
    }

    const annotation = block.annotation.toLowerCase();
    const content = block.content.toLowerCase();

    // Parse identity information
    if (annotation.includes('身份') || annotation.includes('姓名')) {
      if (annotation.includes('姓名')) {
        const match = block.content.match(/用户名为\s+(.+)/);
        if (match) profile.name = match[1].trim();
      }
      if (annotation.includes('邮箱')) {
        const match = block.content.match(/邮箱为\s+(.+)/);
        if (match) profile.email = match[1].trim();
      }
    }

    // Parsing Technology Stack - Language
    if (annotation.includes('技术栈') && annotation.includes('语言')) {
      const languages = block.content.toLowerCase();
      if (languages.includes('typescript')) profile.techStack.languages.push('TypeScript');
      else if (languages.includes('javascript')) profile.techStack.languages.push('JavaScript');
      else if (languages.includes('python')) profile.techStack.languages.push('Python');
      else if (languages.includes('rust')) profile.techStack.languages.push('Rust');
      else if (languages.includes('go')) profile.techStack.languages.push('Go');
      else if (languages.includes('java')) profile.techStack.languages.push('Java');
    }

    // Parse front-end framework
    if (annotation.includes('前端框架')) {
      const frameworks = block.content.toLowerCase();
      if (frameworks.includes('react')) profile.techStack.frameworks.push('React');
      if (frameworks.includes('vue')) profile.techStack.frameworks.push('Vue');
      if (frameworks.includes('angular')) profile.techStack.frameworks.push('Angular');
      if (frameworks.includes('svelte')) profile.techStack.frameworks.push('Svelte');
      if (frameworks.includes('next')) profile.techStack.frameworks.push('Next.js');
      if (frameworks.includes('nuxt')) profile.techStack.frameworks.push('Nuxt');
    }

    // parsing infrastructure
    if (annotation.includes('基础设施')) {
      if (content.includes('postgres')) profile.techStack.infra.push('PostgreSQL');
      if (content.includes('mysql')) profile.techStack.infra.push('MySQL');
      if (content.includes('mongodb') || content.includes('mongo')) profile.techStack.infra.push('MongoDB');
      if (content.includes('redis')) profile.techStack.infra.push('Redis');
      if (content.includes('elasticsearch')) profile.techStack.infra.push('Elasticsearch');
      if (content.includes('rabbitmq') || content.includes('kafka')) profile.techStack.infra.push('消息队列');
    }

    // Parsing code style - indentation
    if (annotation.includes('缩进')) {
      if (content.includes('2 空格')) profile.codeStyle.indent = '2 空格';
      else if (content.includes('4 空格')) profile.codeStyle.indent = '4 空格';
      else if (content.includes('tab')) profile.codeStyle.indent = 'Tab';
    }

    // Parsing code style - quotes
    if (annotation.includes('引号')) {
      if (content.includes('单引号')) profile.codeStyle.quotes = '单引号';
      else if (content.includes('双引号')) profile.codeStyle.quotes = '双引号';
    }

    // Parsing code style - semicolon
    if (annotation.includes('分号')) {
      profile.codeStyle.semicolons = content.includes('使用分号');
    }

    // Parsing code style - trailing commas
    if (annotation.includes('尾随逗号')) {
      const match = block.content.match(/尾随逗号:\s*(.+)/);
      if (match) profile.codeStyle.trailingComma = match[1].trim();
    }

    // Parse project information
    if (annotation.includes('项目')) {
      if (annotation.includes('当前')) {
        const nameMatch = block.content.match(/当前项目:\s*(.+)/);
        if (nameMatch) profile.currentProject.name = nameMatch[1].trim();
      }
      if (annotation.includes('描述') || annotation.includes('标题')) {
        const descMatch = block.content.match(/(?:项目(?:标题|描述|简介)?:\s*)?(.+)/);
        if (descMatch) {
          const desc = descMatch[1].trim();
          if (!profile.currentProject.description) {
            profile.currentProject.description = desc;
          }
        }
      }
    }

    // Parse team information
    if (annotation.includes('团队') || annotation.includes('协作')) {
      if (content.includes('github')) profile.team.platform = 'GitHub';
      if (content.includes('gitlab')) profile.team.platform = 'GitLab';
      if (content.includes('飞书')) profile.team.communication.push('飞书');
      if (content.includes('slack')) profile.team.communication.push('Slack');
      if (content.includes('钉钉')) profile.team.communication.push('钉钉');
      if (content.includes('微信')) profile.team.communication.push('微信');

      // Fetch GitHub org
      const orgMatch = block.content.match(/github org:\s*(\w+)/i);
      if (orgMatch) profile.team.org = orgMatch[1];
    }

    // Analyze roles/positions
    if (annotation.includes('事实') && annotation.includes('身份')) {
      if (content.includes('产品经理')) profile.role = '产品经理';
      else if (content.includes('工程师')) profile.role = '工程师';
      else if (content.includes('设计师')) profile.role = '设计师';
      else if (content.includes('全栈')) profile.role = '全栈工程师';
    }
  }

  // Remove duplicates
  profile.techStack.languages = [...new Set(profile.techStack.languages)];
  profile.techStack.frameworks = [...new Set(profile.techStack.frameworks)];
  profile.techStack.infra = [...new Set(profile.techStack.infra)];
  profile.techStack.tools = [...new Set(profile.techStack.tools)];
  profile.team.communication = [...new Set(profile.team.communication)];
  profile.sources = Array.from(seenSources);

  return profile;
}

/**
 * Format user portrait into readable text
 */
export function formatProfile(profile: IdentityProfile): string {
  const lines: string[] = [];

  // identity
  if (profile.name) {
    const roleStr = profile.role ? `，是一名${profile.role}` : '';
    lines.push(`· 你叫${profile.name}${roleStr}（来自 .gitconfig）`);
  }

  // Technology Stack - Language
  if (profile.techStack.languages.length > 0) {
    const primary = profile.techStack.languages[0];
    const others = profile.techStack.languages.slice(1);
    const othersStr = others.length > 0 ? `，也用 ${others.join('、')}` : '';
    lines.push(`· 你主要写 ${primary}${othersStr}（来自最近的项目）`);
  }

  // Technology stack - front-end framework
  if (profile.techStack.frameworks.length > 0) {
    lines.push(`· 使用前端框架: ${profile.techStack.frameworks.join('、')}（来自项目配置）`);
  }

  // coding style
  const styleItems: string[] = [];
  if (profile.codeStyle.indent) styleItems.push(profile.codeStyle.indent);
  if (profile.codeStyle.quotes) styleItems.push(`${profile.codeStyle.quotes}引号`);
  if (profile.codeStyle.semicolons !== null && !profile.codeStyle.semicolons) {
    styleItems.push('不使用分号');
  }
  if (styleItems.length > 0) {
    lines.push(`· 你偏好 ${styleItems.join('、')}（来自配置文件）`);
  }

  // infrastructure
  if (profile.techStack.infra.length > 0) {
    lines.push(`· 你在用 ${profile.techStack.infra.join(' 和 ')}（来自 docker-compose）`);
  }

  // team
  if (profile.team.org || profile.team.communication.length > 0) {
    const parts: string[] = [];
    if (profile.team.communication.length > 0) {
      parts.push(`${profile.team.communication.join('/')}沟通`);
    }
    if (profile.team.platform) {
      parts.push(`${profile.team.platform} 协作`);
    }
    if (profile.team.org) {
      parts.push(`GitHub org: ${profile.team.org}`);
    }
    if (parts.length > 0) {
      lines.push(`· 你的团队用${parts.join('、')}（来自 git remote）`);
    }
  }

  // Current project
  if (profile.currentProject.name) {
    const descStr = profile.currentProject.description
      ? ` — ${profile.currentProject.description.substring(0, 50)}`
      : '';
    lines.push(`· 你最近在做一个叫 ${profile.currentProject.name}${descStr} 的项目（来自当前目录）`);
  }

  return lines.join('\n');
}

export default { generateProfile, formatProfile };
