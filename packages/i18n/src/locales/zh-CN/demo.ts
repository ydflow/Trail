import type { SameKeysAs } from '../keys.ts';
import type { demo as enDemo } from '../en-US/demo.ts';

/** 内置示例数据文案 — 凡展示示例数据处均配有「示例数据」徽标。 */
export const demo = {
  badge: '示例数据',
  hint: '这是用于预览工作台的内置样例，不代表你的实际持仓或实时行情。',
  about: '了解示例数据',
  realDataHint: '行情和投资组合会在数据源成功返回后自动切换为真实结果。修复连接或权限后，请刷新页面数据。',
  quotesUnavailable: '真实行情请求未成功，因此此区域暂时展示示例价格。',
  portfolioUnavailable: '账户数据请求未成功，因此此区域暂时展示示例投资组合。',
  portfolioPermission: '当前授权未包含账户数据读取权限。需要补充投资组合访问授权，才能显示真实持仓。',
  portfolioEmpty: '账户没有返回资产或持仓，当前金额属于示例投资组合。',
  eventsUnavailable: '此页面目前尚未接入真实日历数据源。这些事件仅用于展示排版，登录后也不会自动变成真实事件。',
  brief: {
    summary: '今天有 2 项内容需要你关注',
    quiet: '2 只监控标的未超过关注阈值。',
    riskTitle: 'AAPL 监管风险或影响 Q4 利润率',
    riskMessage: '欧盟 App Store 裁决在即，或小幅影响服务业务利润率。建议操作：复核压力测试模型。',
    rotationTitle: '板块轮动：科技动能降温',
    rotationMessage: '科技板块动能放缓，医疗保健显示防御性走强。建议审视防御性配置。',
  },
  events: {
    earningsName: 'AAPL 财报电话会（Q3）',
    earningsContent: '盘后发布季度业绩与指引。',
    macroName: 'PCE 通胀数据',
    macroContent: '核心 PCE 公布，美联储重点参考的通胀指标。',
    fomcName: 'FOMC 新闻发布会',
    fomcContent: '利率决议与前瞻指引，重点关注通胀表态。',
  },
} satisfies SameKeysAs<typeof enDemo>;
