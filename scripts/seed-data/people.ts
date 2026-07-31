/**
 * Afghan names, Kabul districts, and review text for the seeded world (PRD §9.4).
 *
 * Written out rather than generated from a faker library: transliterated or
 * Western-sounding names are the fastest way for the client to notice the data is
 * fake. Review bodies are short and colloquial, the way people actually write on a
 * phone, and deliberately not uniformly positive.
 */

export const MALE_FIRST = [
  'احمد',
  'محمد',
  'عبدالله',
  'نصیر',
  'فرید',
  'جاوید',
  'حمید',
  'وحید',
  'سمیع',
  'ادریس',
  'بلال',
  'عمران',
  'شفیع',
  'نجیب',
  'رحمت',
  'اسدالله',
  'مسعود',
  'زلمی',
];

export const FEMALE_FIRST = [
  'زهرا',
  'فاطمه',
  'مریم',
  'سارا',
  'نرگس',
  'لیلا',
  'حمیرا',
  'شکریا',
  'پروین',
  'نادیه',
  'فرشته',
  'سمیرا',
  'رویا',
  'عادله',
  'منیژه',
  'گلثوم',
];

export const SURNAMES = [
  'احمدی',
  'محمدی',
  'رحیمی',
  'کریمی',
  'نظری',
  'صافی',
  'بارکزی',
  'پوپل',
  'حیدری',
  'سلطانی',
  'فرهنگ',
  'امینی',
  'رسولی',
  'جلالی',
  'نوری',
  'سادات',
  'یوسفی',
  'شریفی',
];

/** Real Kabul districts and neighbourhoods, used for delivery addresses. */
export const KABUL_DISTRICTS = [
  'کارته سه',
  'کارته چهار',
  'شهر نو',
  'تایمنی',
  'خیرخانه',
  'وزیر اکبر خان',
  'دارالامان',
  'پل سرخ',
  'قلعه فتح‌الله',
  'مکروریان کهنه',
  'مکروریان نو',
  'کوته سنگی',
  'دهبوری',
  'چهل‌ستون',
  'افشار',
];

export const STREET_DETAILS = [
  'سرک اول، خانه شماره ۱۲، منزل دوم',
  'کوچه مسجد، خانه شماره ۴',
  'عقب مارکت، بلاک ۳، اپارتمان ۷',
  'سرک دوم، پهلوی نانوایی، خانه سبز',
  'کوچه سوم، خانه شماره ۲۱',
  'بلاک ۱۱، منزل چهارم، اپارتمان ۱۶',
  'مقابل پارک، خانه شماره ۸',
  'سرک عمومی، پهلوی درملتون، منزل اول',
];

export const ADDRESS_LABELS = ['خانه', 'دفتر', 'خانه پدر', 'دکان'];

/**
 * Review bodies keyed loosely by rating band. Ratings skew 4–5 with honest 2–3s
 * sprinkled in (PRD §9.4) — a wall of five stars reads as fabricated.
 */
export const REVIEWS_FA: Record<number, string[]> = {
  5: [
    'جنس اصل بود، تشکر از دکاندار.',
    'کیفیت خوب و قیمت مناسب. توصیه می‌کنم.',
    'همان چیزی بود که در تصویر دیدم. بسیار راضی هستم.',
    'زود رسید و بسته‌بندی هم مرتب بود.',
    'بهترین قیمت در مرکز گلبهار. دوباره خرید می‌کنم.',
    'دکاندار بسیار برخورد خوب داشت. جنس هم عالی.',
    'از کیفیت راضی هستم، به دوستانم هم معرفی کردم.',
  ],
  4: [
    'خوب است، ارزش قیمت را دارد.',
    'کیفیت مناسب. تحویل کمی دیر شد ولی مشکلی نبود.',
    'راضی هستم، فقط رنگش کمی تفاوت داشت.',
    'جنس خوب است. بسته‌بندی می‌توانست بهتر باشد.',
    'در مجموع خوب بود، تشکر.',
    'مطابق توضیحات بود. تحویل به وقت.',
  ],
  3: [
    'متوسط است. انتظار بیشتر داشتم.',
    'قیمت کمی بلند است نسبت به کیفیت.',
    'بد نیست ولی چیز خاصی هم نیست.',
    'اندازه‌اش کمی خورد بود، تبدیل کردم.',
  ],
  2: [
    'کیفیت آنقدر که فکر می‌کردم نبود.',
    'تحویل بسیار دیر شد و جواب تلفن هم ندادند.',
    'رنگ و شکل با تصویر تفاوت داشت.',
  ],
  1: ['متأسفانه جنس خراب رسید.', 'مطابق سفارش نبود.'],
};

/** A handful of English reviews, since some customers use the English UI. */
export const REVIEWS_EN: Record<number, string[]> = {
  5: [
    'Exactly as described and arrived quickly. Very happy.',
    'Genuine product, good price. Recommended.',
    'Great service from the shop, will buy again.',
  ],
  4: ['Good quality for the price. Delivery was a little slow.', 'Happy with it overall.'],
  3: ['Average. Expected a bit more for the price.'],
  2: ['Not the quality I expected.'],
};

/** Shopkeeper replies. Public and once per review (PRD §5.5). */
export const RESPONSES_FA = [
  'تشکر از خرید شما. باز هم منتظر شما هستیم.',
  'ممنون از نظر شما. خوش آمدید.',
  'از اعتماد شما تشکر می‌کنیم.',
  'معذرت می‌خواهیم از تأخیر. کوشش می‌کنیم بهتر شویم.',
  'تشکر از راهنمایی شما، حتماً اصلاح می‌کنیم.',
  'خوشحالیم که راضی بودید. سلامت باشید.',
];

/** Offer names, shown on the storefront offers strip. */
export const OFFER_NAMES = [
  { fa: 'تخفیف ویژه بهار', en: 'Spring Special' },
  { fa: 'حراج آخر هفته', en: 'Weekend Sale' },
  { fa: 'تخفیف عیدی', en: 'Eid Offer' },
  { fa: 'پیشکش بازگشت به مکتب', en: 'Back to School Offer' },
  { fa: 'تخفیف مشتریان جدید', en: 'New Customer Discount' },
  { fa: 'حراج پایان فصل', en: 'End of Season Sale' },
  { fa: 'تخفیف روز جمعه', en: 'Friday Discount' },
];

/**
 * SHOP reviews (Prompt C8) — about the service, never about the product.
 *
 * Kept separate from REVIEWS_FA on purpose: "the fabric is good quality" says
 * nothing about a shop, and a reviews tab full of product opinions is exactly
 * the failure that made a second table worth having. Every line here is about
 * something only the shop controls — the phone, the counter, the packing, the
 * wait, whether they said the truth about stock.
 */
export const SHOP_REVIEWS_FA: Record<number, string[]> = {
  5: [
    'تلیفون را زود جواب دادند و سفارش را همان روز آماده کردند.',
    'دکاندار بسیار مؤدب بود و برای انتخاب وقت گذاشت.',
    'بسته‌بندی مرتب بود و هیچ چیز کم نبود.',
    'گفتند دو روز آماده می‌شود، یک روزه آماده شد.',
    'وقتی رفتم گرفتن، فوراً پیدا کردند و معطل نشدم.',
    'راست گفتند که کدام رنگ موجود نیست، وقتم را ضایع نکردند.',
  ],
  4: [
    'برخورد خوب داشتند، فقط پیدا کردن دکان کمی وقت گرفت.',
    'سفارش درست بود، یک روز دیرتر از وعده آماده شد.',
    'همه چیز خوب بود، بسته‌بندی می‌توانست بهتر باشد.',
    'راضی هستم. زنگ زدم و با حوصله جواب دادند.',
  ],
  3: [
    'سفارش درست تحویل شد ولی چند بار زنگ زدم تا جواب دادند.',
    'انتظار در دکان کمی زیاد بود، خود جنس مشکلی نداشت.',
  ],
  2: [
    'وعده کردند صبح آماده است، عصر رفتم هنوز آماده نبود.',
    'تلیفون را جواب نمی‌دادند و مجبور شدم دو بار بروم.',
  ],
  1: ['سفارش را قبول کردند و بعد گفتند موجود نیست. باید از اول می‌گفتند.'],
};

export const SHOP_REVIEWS_EN: Record<number, string[]> = {
  5: [
    'Answered the phone straight away and had the order ready the same day.',
    'Very helpful at the counter — took the time to explain the options.',
    'Packed properly and nothing was missing.',
  ],
  4: ['Good service, a day later than promised but they called to say so.'],
  3: ['The order was right, but it took a few calls before anyone picked up.'],
};
