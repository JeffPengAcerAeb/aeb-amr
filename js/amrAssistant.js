const report = { label: '前往年季報', path: 'amr/reports' };
const downloads = { label: '前往檔案下載', path: 'amr/downloads' };
const oneHealth = { label: '前往 One Health', path: 'amr/one-health' };
const topics = [
    {
        id: 'help', title: '小幫手可以做什麼？',
        terms: ['可以問什麼', '能做什麼', '有哪些功能', '怎麼使用', '使用說明', '幫助', 'help'],
        text: '我可以協助尋找年季報、檔案下載與 One Health 頁面，也能說明 AMR、HAI、MRSA、CRAB 等常見名詞。目前使用站內整理的問答內容，沒有連接生成式 AI，也不會讀取你正在操作的圖表或提供即時監測數字。',
        links: [report, downloads], suggestions: ['年季報在哪裡？', '什麼是 AMR？', '如何下載檔案？']
    },
    {
        id: 'reports', title: '年季報在哪裡？',
        terms: ['年季報', '年報', '季報', '報表', '監測報告', 'reports', 'report'],
        text: '進入「年季報」，再從「監測主題」選擇 HAI、AMR、AU 或 AR，查看對應的報表項目與查詢條件。資料範圍、單位及示例／正式資料狀態，請以各報表標示為準；小幫手不會代替你變更目前的篩選條件。',
        links: [report], suggestions: ['HAI 是什麼？', 'AU 和 AR 有什麼不同？', '如何下載檔案？']
    },
    {
        id: 'downloads', title: '如何下載檔案？',
        terms: ['下載', '匯出', '附件', 'csv', 'pdf', 'odf', 'odt', 'download', 'export'],
        text: '新版「檔案下載」提供分類、關鍵字、格式、年份與機關篩選；「匯出檔案清單」會匯出全部篩選結果。「詳情」可查看檔案資訊。目前這個專區仍是示例目錄，下載按鈕產生 TXT 說明，格式與容量是範本示意值，不是正式附件。報表圖表的匯出則請使用各圖表自己的控制項。',
        links: [downloads, report], suggestions: ['年季報在哪裡？', '資料是正式統計嗎？']
    },
    {
        id: 'news', title: '最新消息在哪裡？',
        terms: ['最新消息', '新聞', '活動', '研討會', 'news'],
        text: '「最新消息」可查看焦點消息與活動，並透過關鍵字、分類及日期排序尋找內容。點選消息可開啟詳細資訊；消息是否為示例，請以頁面標示為準。',
        links: [{ label: '前往最新消息', path: 'amr/news' }], suggestions: ['如何下載檔案？', 'One Health 是什麼？']
    },
    {
        id: 'amr', title: '什麼是 AMR？',
        terms: ['amr', '抗藥性', '抗微生物', '超級細菌', 'antimicrobial resistance'],
        text: '抗微生物製劑抗藥性（AMR）是指微生物對原本有效的藥物不再敏感，使感染更難治療。「抗藥性」是微生物的特性，不是人體對藥物產生抵抗力。閱讀監測資料時，應一併確認菌種、藥物、檢體、年度與統計定義。',
        links: [report], suggestions: ['MRSA 是什麼？', 'CRAB 是什麼？', 'One Health 是什麼？']
    },
    {
        id: 'hai', title: 'HAI 是什麼？',
        terms: ['hai', '醫療照護相關感染', '院內感染', '感染密度', '導管日', 'clabsi', 'cauti', 'vap'],
        text: 'HAI 是醫療照護相關感染。感染率與感染密度的分母不同，不能直接互換；感染密度通常以感染事件數除以暴露時間，再依報表單位換算，例如每千病人日或每千導管日。比較報表前，請確認監測定義、病房類型及分母是否一致。',
        links: [report], suggestions: ['THAS 與 TNIS 是什麼？', '年季報在哪裡？']
    },
    {
        id: 'au-ar', title: 'AU 和 AR 有什麼不同？',
        terms: ['au', 'ar', '抗生素使用', '使用量', '抗藥率', '抗藥比例', 'ddd', 'dot', '敏感率', '感受性'],
        text: 'AU 著重抗生素使用情形，AR 著重菌株對藥物的抗藥性。DDD 與 DOT 是不同的使用量衡量方式，不能直接視為相同數值；抗藥比例也不等同抗生素使用量。敏感、中介與抗藥的分類須依報表定義，不能一律用「100% 減敏感率」當作抗藥率。',
        links: [report], suggestions: ['HAI 是什麼？', '資料是正式統計嗎？']
    },
    {
        id: 'mrsa', title: 'MRSA 是什麼？',
        terms: ['mrsa', '甲氧西林', '金黃色葡萄球菌'],
        text: 'MRSA 指對 methicillin 類藥物具有抗藥性的金黃色葡萄球菌。它是抗藥性監測常見的病原之一。閱讀相關比例時，需要確認檢體來源、醫院層級與分離株篩選方式；監測比例不能直接用來決定個別病人的治療。',
        links: [report], suggestions: ['VRE 是什麼？', 'CRAB 是什麼？', '年季報在哪裡？']
    },
    {
        id: 'vre', title: 'VRE 是什麼？',
        terms: ['vre', '萬古黴素', '腸球菌'],
        text: 'VRE 指對 vancomycin（萬古黴素）具有抗藥性的腸球菌。定殖與感染並不相同，不能僅依檢出結果推論需要治療。相關監測須注意菌種、檢體與院所範圍；個別照護應由醫療團隊評估。',
        links: [report], suggestions: ['MRSA 是什麼？', '什麼是 AMR？']
    },
    {
        id: 'crab', title: 'CRAB 是什麼？',
        terms: ['crab', '鮑氏', '不動桿菌'],
        text: 'CRAB 指對碳青黴烯類具有抗藥性的鮑氏不動桿菌。它是醫療照護抗藥性監測關注的病原之一。本站小幫手只提供名詞說明；年度比例與醫院層級比較，請使用年季報中的條件查詢，不以另一個網站的數字代答。',
        links: [report], suggestions: ['CRE 與 CRKP 有什麼不同？', '年季報在哪裡？']
    },
    {
        id: 'cre', title: 'CRE 與 CRKP 有什麼不同？',
        terms: ['cre', 'crkp', '克雷伯', '腸內菌', '碳青黴烯'],
        text: 'CRE 指對碳青黴烯類具有抗藥性的腸內菌目細菌；CRKP 則特指具有這類抗藥性的肺炎克雷伯氏菌。兩者涵蓋範圍不同，比較報表時要先確認菌種群與檢驗定義。',
        links: [report], suggestions: ['CRAB 是什麼？', '什麼是 AMR？']
    },
    {
        id: 'one-health', title: 'One Health 是什麼？',
        terms: ['one health', 'onehealth', '防疫一體', '一體健康', '動物', '環境', '跨部門', '跨機關', '畜牧'],
        text: 'One Health（一體健康）強調人類、動物與環境的健康彼此相連。抗藥性議題需要衛生、農業與環境等部門合作。本站的 One Health 專區提供跨機關監測入口；不同部門的指標與分母可能不同，不宜直接相加或排名。',
        links: [oneHealth], suggestions: ['什麼是 AMR？', '資料是正式統計嗎？']
    },
    {
        id: 'systems', title: 'THAS 與 TNIS 是什麼？',
        terms: ['thas', 'tnis', '監視系統', '通報系統'],
        text: 'THAS 是臺灣醫療照護相關感染與抗藥性監視的整合平台；TNIS 是醫療照護相關感染監視相關系統名稱。系統與各年報的涵蓋範圍、定義及通報條件，應以疾管署當期文件為準。小幫手沒有連接這些系統或取得非公開通報資料。',
        links: [report], suggestions: ['HAI 是什麼？', '資料是正式統計嗎？']
    },
    {
        id: 'data', title: '資料是正式統計嗎？',
        terms: ['資料來源', '正式', '示例', '真實', '準確', '最新資料', '授權', '資料品質', '校驗'],
        text: '目前新版包含示例頁面與示例下載，不能把整個網站都視為正式統計。請逐一確認報表的資料來源、發布年度、單位及說明。小幫手沒有即時連接報表資料庫，不會引用原型網站的估計值當作本站結果。',
        links: [report, downloads], suggestions: ['年季報在哪裡？', '如何下載檔案？']
    }
];

export const welcomeQuestions = ['年季報在哪裡？', '什麼是 AMR？', '如何下載檔案？', 'One Health 是什麼？'];
const normalize = value => value.normalize('NFKC').toLowerCase().replace(/臺/g, '台').replace(/\s+/g, ' ').trim();
const matchesTerm = (query, term) => /^[a-z0-9 ]+$/.test(term)
    ? new RegExp(`(^|[^a-z0-9])${term.replace(/ /g, '\\s+')}($|[^a-z0-9])`).test(query)
    : query.includes(term);
const response = (kind, text, links = [], suggestions = welcomeQuestions, topic = null) =>
    ({ kind, text, links, suggestions, topic });

export function answerQuestion(raw, previousTopic = null) {
    if (typeof raw !== 'string' || !raw.trim() || raw.length > 600)
        throw new Error('請輸入 1 至 600 字的問題。');
    const query = normalize(raw);
    if (/(我|家人|小孩|孩子|病人|患者).*(發燒|症狀|感染|吃藥|用藥|治療)|該吃|吃什麼藥|用什麼藥|劑量|處方|診斷|停藥|換藥|which (drug|medicine)|my (symptoms|child)|dosage/.test(query))
        return response('scope', '小幫手提供監測名詞與網站操作說明，無法診斷、選藥或建議劑量。個別症狀、檢驗結果與用藥問題，請由醫師或藥師評估。', [], ['什麼是 AMR？', 'HAI 是什麼？']);
    if (/^(你好|您好|哈囉|嗨|早安|午安|晚安|hello|hi|hey)[!！?？。.\s]*$/.test(query))
        return response('knowledge', '你好，我是 AMR 小幫手。可以幫你找站內功能，或解釋抗藥性監測名詞。請直接輸入問題，或選擇下方常見問題。');
    const ranked = topics.map(topic => ({
        topic, score: topic.terms.reduce((score, term) => score + (matchesTerm(query, term) ? Math.min(term.length, 6) : 0), 0)
    })).filter(hit => hit.score > 0).sort((a, b) => b.score - a.score);
    if (/下載|匯出|\bdownload\b|\bexport\b/.test(query)) {
        const topic = topics.find(item => item.id === 'downloads');
        return response('knowledge', topic.text, topic.links, topic.suggestions, topic.id);
    }
    if (matchesTerm(query, 'hai') && matchesTerm(query, 'amr') && /不同|差別|差異|difference/.test(query))
        return response('knowledge', 'HAI 關注醫療照護相關感染的發生情形；AMR 關注微生物對藥物的抗藥性。醫療照護相關感染不一定由抗藥菌引起，抗藥菌也不只出現在醫療照護場域。兩者是相關但不同的監測面向。', [report], ['HAI 是什麼？', '什麼是 AMR？', '年季報在哪裡？']);
    const numeric = /20\d{2}|19\d{2}|多少|幾%|百分比|最高|最低|趨勢|比較|排名|統計數|數值|數據|今年|去年|\brate\b|\btrend\b|\bcompare\b|\bhighest\b/.test(query);
    const dataDomain = ranked.some(hit => !['help', 'news', 'downloads'].includes(hit.topic.id))
        || /醫院|醫學中心|病房|分離株|菌株/.test(query)
        || (previousTopic && /那|它|這|呢|多少|最高|最低/.test(query));
    if (numeric && dataDomain && !/在哪|哪裡|如何查|怎麼查|如何下載|怎麼下載/.test(query))
        return response('data', '這是數值或趨勢查詢。目前小幫手尚未串接本站報表資料，無法可靠地提供這個結果。請到年季報選擇主題、年度及院所等條件，並確認圖表的資料來源與單位。', [report], ['年季報在哪裡？', '資料是正式統計嗎？'], previousTopic);
    let topic = ranked[0]?.topic;
    if (!topic && previousTopic && /^(那|它|這個|再說明|詳細|更多)/.test(query))
        topic = topics.find(item => item.id === previousTopic);
    if (!topic)
        return response('unknown', '目前站內問答沒有足夠內容回答這個問題。你可以改問一個 AMR 名詞，或選擇下方的站內導覽問題；我不會編造缺少的資料。', [], welcomeQuestions);
    return response('knowledge', topic.text, topic.links, topic.suggestions, topic.id);
}

const bindings = new WeakMap();
export function attach(dialog) {
    if (bindings.has(dialog)) return;
    const input = dialog.querySelector('textarea');
    const form = dialog.querySelector('form');
    let composing = false;
    const onCompositionStart = () => { composing = true; };
    const onCompositionEnd = () => { composing = false; };
    const onKey = event => {
        if (event.key === 'Escape' && (event.isComposing || composing || event.keyCode === 229)) {
            event.stopPropagation();
            return;
        }
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !composing && event.keyCode !== 229) {
            event.preventDefault();
            if (!form.querySelector('[type="submit"]').disabled) form.requestSubmit();
        }
    };
    input.addEventListener('compositionstart', onCompositionStart);
    input.addEventListener('compositionend', onCompositionEnd);
    input.addEventListener('keydown', onKey);
    bindings.set(dialog, { input, onCompositionStart, onCompositionEnd, onKey });
}

export function refresh(dialog, focusInput = false, scrollToEnd = true) {
    if (focusInput) dialog.querySelector('textarea').focus({ preventScroll: true });
    const log = dialog.querySelector('[role="log"]');
    log.scrollTop = scrollToEnd ? log.scrollHeight : 0;
}

export function dispose(dialog) {
    const binding = bindings.get(dialog);
    if (!binding) return;
    binding.input.removeEventListener('compositionstart', binding.onCompositionStart);
    binding.input.removeEventListener('compositionend', binding.onCompositionEnd);
    binding.input.removeEventListener('keydown', binding.onKey);
    bindings.delete(dialog);
}
