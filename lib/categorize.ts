export type Category = '政策' | '海外動向' | '教材・研究' | 'その他';

type KeywordCategory = Exclude<Category, 'その他'>;

const CATEGORY_KEYWORDS: Record<KeywordCategory, string[]> = {
  政策: [
    '法律',
    '施策',
    '告示',
    '改定',
    '文化庁',
    '文部科学省',
    '政策',
    '制度',
    '答申',
    '審議',
    '法案',
    '閣議',
    '省令',
    '通知',
    '指針',
    '方針',
    '外国人労働',
    '技能実習',
    '特定技能',
    '在留資格',
    '入管',
    '多文化共生',
    '移民',
    '外国人受入',
    '外国籍',
    '難民',
  ],
  海外動向: [
    '海外',
    '国際',
    '外国',
    '諸外国',
    'アジア',
    '欧米',
    'JF',
    '国際交流基金',
    '海外日本語',
    '外国語',
    '留学',
    'JLPT',
    '日本語能力試験',
    'インドネシア',
    '中国',
    '韓国',
    'ベトナム',
    'フランス',
    'ドイツ',
    'アメリカ',
    '英語圏',
    '異文化',
    '国際理解',
  ],
  '教材・研究': [
    '教材',
    '研究',
    '学習',
    '教授法',
    'シラバス',
    'カリキュラム',
    '論文',
    '学会',
    '授業',
    '教科書',
    '語彙',
    '文法',
    '読解',
    '聴解',
    '会話',
    'e-learning',
    'eラーニング',
    'オンライン授業',
    '発音',
    '漢字',
  ],
};

// 文化庁・文部科学省など広範な情報を発信するソースに対して、
// 日本語教育関連の記事かどうかを判定するキーワード
const RELEVANCE_KEYWORDS = [
  '日本語',
  '国語',
  '外国人児童',
  '外国人生徒',
  '外国人の子ども',
  '日本語指導',
  '外国籍',
  '在留外国人',
  '多文化',
  '異文化',
  '言語政策',
  '技能実習',
  '特定技能',
  '移民',
  '難民',
  'にほんご',
];

// 特定ソースの記事が日本語教育に関連するか判定する
// 対象外ソース（Googleニュース・国際交流基金等）はtrueを返す
export function isRelevantArticle(title: string, sourceName: string): boolean {
  const FILTERED_SOURCES = ['文化庁', '文部科学省'];
  if (!FILTERED_SOURCES.includes(sourceName)) return true;
  return RELEVANCE_KEYWORDS.some((kw) => title.includes(kw));
}

export function categorize(text: string): Category {
  const normalizedText = text.toLowerCase();

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [KeywordCategory, string[]][]) {
    for (const keyword of keywords) {
      if (normalizedText.includes(keyword)) {
        return category;
      }
    }
  }

  return 'その他';
}
