#!/usr/bin/env python3
"""
Authors content/seed/shops.json and content/seed/products.json.

Kept as a generator rather than hand-edited JSON so prices, stock and slugs stay
internally consistent and re-runnable. The CONTENT is hand-written: real product
names and genuine Kabul retail prices in afghanis (roughly 70 AFN to the dollar),
per PRD §9.4 — placeholder content undermines the demo more than any missing
feature.

Run: python3 scripts/author-seed-content.py
"""
import json
import pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "content" / "seed"
OUT.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# Category taxonomy — two levels, admin-owned (PRD §3.1, §7.2). Trilingual, with
# Pashto present because category names are the one content type the PRD says
# admin maintains in ALL languages (PRD §11).
# ---------------------------------------------------------------------------
CATEGORIES = [
    {"slug": "electronics", "name": {"fa": "الکترونیک", "en": "Electronics", "ps": "بریښنایي وسایل"}, "children": [
        {"slug": "mobiles-tablets", "name": {"fa": "موبایل و تابلت", "en": "Mobiles & Tablets", "ps": "موبایل او ټابلیټ"}},
        {"slug": "home-electronics", "name": {"fa": "لوازم برقی خانه", "en": "Home Electronics", "ps": "کورني بریښنايي توکي"}},
        {"slug": "audio-video", "name": {"fa": "صدا و تصویر", "en": "Audio & Video", "ps": "غږ او تصویر"}},
    ]},
    {"slug": "beauty", "name": {"fa": "زیبایی و آرایش", "en": "Beauty", "ps": "ښکلا او سينګار"}, "children": [
        {"slug": "cosmetics", "name": {"fa": "لوازم آرایشی", "en": "Cosmetics", "ps": "سينګار توکي"}},
        {"slug": "perfume", "name": {"fa": "عطر و ادکلن", "en": "Perfume", "ps": "عطر"}},
    ]},
    {"slug": "clothing", "name": {"fa": "پوشاک", "en": "Clothing", "ps": "جامې"}, "children": [
        {"slug": "menswear", "name": {"fa": "پوشاک مردانه", "en": "Menswear", "ps": "نارینه جامې"}},
        {"slug": "womenswear", "name": {"fa": "پوشاک زنانه", "en": "Womenswear", "ps": "ښځینه جامې"}},
        {"slug": "shoes", "name": {"fa": "کفش", "en": "Shoes", "ps": "بوټان"}},
        {"slug": "bags", "name": {"fa": "کیف و چمدان", "en": "Bags & Luggage", "ps": "بکسې"}},
    ]},
    {"slug": "home-kitchen", "name": {"fa": "خانه و آشپزخانه", "en": "Home & Kitchen", "ps": "کور او پخلنځی"}, "children": [
        {"slug": "kitchen-appliances", "name": {"fa": "لوازم آشپزخانه", "en": "Kitchen Appliances", "ps": "پخلنځي وسایل"}},
    ]},
    {"slug": "watches-jewellery", "name": {"fa": "ساعت و جواهرات", "en": "Watches & Jewellery", "ps": "ساعتونه او ګاڼې"}, "children": [
        {"slug": "watches", "name": {"fa": "ساعت", "en": "Watches", "ps": "ساعتونه"}},
        {"slug": "jewellery", "name": {"fa": "جواهرات", "en": "Jewellery", "ps": "ګاڼې"}},
    ]},
    {"slug": "kids-hobby", "name": {"fa": "کودک و سرگرمی", "en": "Kids & Hobby", "ps": "ماشومان او ساتیري"}, "children": [
        {"slug": "toys", "name": {"fa": "اسباب‌بازی", "en": "Toys", "ps": "لوبتکې"}},
        {"slug": "stationery", "name": {"fa": "قرطاسیه", "en": "Stationery", "ps": "قرطاسیه"}},
    ]},
    {"slug": "sports", "name": {"fa": "ورزش", "en": "Sports", "ps": "لوبې"}, "children": [
        {"slug": "sportswear", "name": {"fa": "لباس ورزشی", "en": "Sportswear", "ps": "سپورتي جامې"}},
    ]},
    {"slug": "food", "name": {"fa": "خوراکه", "en": "Food", "ps": "خوراکي توکي"}, "children": [
        {"slug": "dried-fruit-sweets", "name": {"fa": "خشکبار و شیرینی", "en": "Dried Fruit & Sweets", "ps": "وچه میوه او خواږه"}},
    ]},
]

# ---------------------------------------------------------------------------
# 14 shops. Names follow how Kabul businesses actually name themselves — a family
# or place name plus the trade. Floors 1–3 with unit numbers, since floor/unit is
# real metadata used for in-store pickup (PRD §4).
# ---------------------------------------------------------------------------
SHOPS = [
    {
        "slug": "kabul-electronics", "category": "electronics", "floor": 2, "unit": "۲۱۴",
        "name": {"fa": "الکترونیک کابل", "en": "Kabul Electronics"},
        "description": {
            "fa": "فروش لوازم برقی و الکترونیکی اصل با گرانتی. بیش از ۱۵ سال در مرکز گلبهار.",
            "en": "Genuine electronics and appliances with warranty. Over 15 years in Gulbahar Center.",
        },
        "hours": "۸:۰۰ – ۱۹:۰۰", "phone": "0700100201",
    },
    {
        "slug": "markaz-mobile", "category": "mobiles-tablets", "floor": 1, "unit": "۱۰۵",
        "name": {"fa": "موبایل مرکز", "en": "Markaz Mobile"},
        "description": {
            "fa": "نمایندگی رسمی موبایل و تابلت. تبدیل، خرید و فروش با قیمت مناسب.",
            "en": "Official mobile and tablet dealer. Trade-in, buy and sell at fair prices.",
        },
        "hours": "۸:۳۰ – ۲۰:۰۰", "phone": "0700100202",
    },
    {
        "slug": "bahar-cosmetics", "category": "cosmetics", "floor": 1, "unit": "۱۲۸",
        "name": {"fa": "آرایشی بهار", "en": "Bahar Cosmetics"},
        "description": {
            "fa": "لوازم آرایشی اصل از برندهای معروف جهان. مشوره رایگان از طرف کارمندان ما.",
            "en": "Authentic cosmetics from well-known international brands. Free advice from our staff.",
        },
        "hours": "۹:۰۰ – ۱۹:۳۰", "phone": "0700100203",
    },
    {
        "slug": "golden-perfumes", "category": "perfume", "floor": 1, "unit": "۱۳۲",
        "name": {"fa": "عطریات طلایی", "en": "Golden Perfumes"},
        "description": {
            "fa": "عطر و ادکلن اصل شرقی و فرانسوی. امکان تست همه عطرها در دکان.",
            "en": "Authentic oriental and French fragrances. Try any scent in store.",
        },
        "hours": "۹:۰۰ – ۲۰:۰۰", "phone": "0700100204",
    },
    {
        "slug": "noor-watches", "category": "watches", "floor": 2, "unit": "۲۰۷",
        "name": {"fa": "ساعت‌فروشی نور", "en": "Noor Watches"},
        "description": {
            "fa": "ساعت مردانه و زنانه از برندهای معتبر. ترمیم و تبدیل باتری در جای.",
            "en": "Men's and women's watches from trusted brands. On-site repair and battery change.",
        },
        "hours": "۸:۳۰ – ۱۹:۰۰", "phone": "0700100205",
    },
    {
        "slug": "ariana-clothing", "category": "menswear", "floor": 3, "unit": "۳۱۱",
        "name": {"fa": "پوشاک آریانا", "en": "Ariana Clothing"},
        "description": {
            "fa": "پوشاک مردانه و زنانه، دوخت ترکی و وطنی. سایزهای مختلف موجود است.",
            "en": "Men's and women's clothing, Turkish and locally tailored. All sizes available.",
        },
        "hours": "۹:۰۰ – ۱۹:۳۰", "phone": "0700100206",
    },
    {
        "slug": "pamir-shoes", "category": "shoes", "floor": 3, "unit": "۳۰۴",
        "name": {"fa": "کفش پامیر", "en": "Pamir Shoes"},
        "description": {
            "fa": "کفش چرمی اصل، مردانه و زنانه. کفش مکتب و کفش ورزشی هم موجود است.",
            "en": "Genuine leather shoes for men and women. School and sports shoes also available.",
        },
        "hours": "۸:۰۰ – ۱۹:۰۰", "phone": "0700100207",
    },
    {
        "slug": "salam-home", "category": "kitchen-appliances", "floor": 2, "unit": "۲۲۶",
        "name": {"fa": "لوازم خانه سلام", "en": "Salam Home Appliances"},
        "description": {
            "fa": "همه لوازم آشپزخانه و خانه در یک جای. تحویل رایگان در شهر کابل.",
            "en": "Every kitchen and household item in one place. Free delivery within Kabul.",
        },
        "hours": "۸:۰۰ – ۱۹:۰۰", "phone": "0700100208",
    },
    {
        "slug": "kudak-toys", "category": "toys", "floor": 3, "unit": "۳۲۲",
        "name": {"fa": "اسباب‌بازی کودک", "en": "Kudak Toys"},
        "description": {
            "fa": "اسباب‌بازی سالم و بی‌خطر برای هر سن. تحفه‌های تولد و عیدی.",
            "en": "Safe, well-made toys for every age. Birthday and Eid gifts.",
        },
        "hours": "۹:۰۰ – ۱۹:۰۰", "phone": "0700100209",
    },
    {
        "slug": "danesh-stationery", "category": "stationery", "floor": 1, "unit": "۱۱۹",
        "name": {"fa": "قرطاسیه دانش", "en": "Danesh Stationery"},
        "description": {
            "fa": "قرطاسیه مکتب و دفتر، کتاب و لوازم رسامی. تخفیف برای مکاتب.",
            "en": "School and office stationery, books and art supplies. Discounts for schools.",
        },
        "hours": "۷:۳۰ – ۱۸:۳۰", "phone": "0700100210",
    },
    {
        "slug": "herat-jewellery", "category": "jewellery", "floor": 2, "unit": "۲۰۱",
        "name": {"fa": "جواهرات هرات", "en": "Herat Jewellery"},
        "description": {
            "fa": "طلا و نقره با عیار تضمینی. ساخت سفارشی زیورات به سلیقه شما.",
            "en": "Gold and silver with guaranteed purity. Custom jewellery made to order.",
        },
        "hours": "۹:۰۰ – ۱۸:۳۰", "phone": "0700100211",
    },
    {
        "slug": "zarin-bags", "category": "bags", "floor": 3, "unit": "۳۱۸",
        "name": {"fa": "کیف و چمدان زرین", "en": "Zarin Bags & Luggage"},
        "description": {
            "fa": "کیف دستی، بکس مکتب و چمدان سفر. جنس مقاوم با قیمت مناسب.",
            "en": "Handbags, school backpacks and travel luggage. Durable goods at fair prices.",
        },
        "hours": "۸:۳۰ – ۱۹:۰۰", "phone": "0700100212",
    },
    {
        "slug": "alborz-sports", "category": "sportswear", "floor": 3, "unit": "۳۲۷",
        "name": {"fa": "ورزشی البرز", "en": "Alborz Sportswear"},
        "description": {
            "fa": "لباس و لوازم ورزشی برای فوتبال، کرکت و جمنازیم.",
            "en": "Sportswear and equipment for football, cricket and the gym.",
        },
        "hours": "۹:۰۰ – ۱۹:۳۰", "phone": "0700100213",
    },
    # The 14th shop stays PENDING for the live approval moment (PRD §9.4).
    {
        "slug": "kabul-dried-fruit", "category": "dried-fruit-sweets", "floor": 1, "unit": "۱۴۱",
        "name": {"fa": "خشکبار و شیرینی کابل", "en": "Kabul Dried Fruit & Sweets"},
        "description": {
            "fa": "خشکبار تازه افغانی: پسته، بادام، کشمش و شیرینی خانگی. بسته‌بندی تحفه‌ای.",
            "en": "Fresh Afghan dried fruit: pistachios, almonds, raisins and homemade sweets. Gift packaging.",
        },
        "hours": "۸:۰۰ – ۱۹:۰۰", "phone": "0700100214",
        "status": "pending",
    },
]

# ---------------------------------------------------------------------------
# 75 products. Prices are integer afghanis at genuine Kabul retail levels
# (~70 AFN to the dollar). `discount` marks the 9 products on offer; `variants`
# is used only where a variant axis is natural.
# ---------------------------------------------------------------------------
P = []


def add(shop, category, slug, fa, en, desc_fa, desc_en, price, stock,
        discount=None, variants=None, views=0):
    P.append({
        "slug": slug, "shopSlug": shop, "categorySlug": category,
        "title": {"fa": fa, "en": en},
        "description": {"fa": desc_fa, "en": desc_en},
        "price": price, "discountPrice": discount, "stock": stock,
        "variants": variants or [], "viewCount": views,
    })


SIZE_CLOTHES = {"name": {"fa": "سایز", "en": "Size"},
                "options": [{"fa": "سمال", "en": "S"}, {"fa": "میدیم", "en": "M"},
                            {"fa": "لارج", "en": "L"}, {"fa": "ایکس‌لارج", "en": "XL"}]}
COLOR_BASIC = {"name": {"fa": "رنگ", "en": "Colour"},
               "options": [{"fa": "سیاه", "en": "Black"}, {"fa": "سفید", "en": "White"},
                           {"fa": "سرمه‌ای", "en": "Navy"}]}

# --- Kabul Electronics (electronics / home-electronics / audio-video) ------
add("kabul-electronics", "home-electronics", "lg-tv-43-smart",
    "تلویزیون ال‌جی ۴۳ اینچ اسمارت", "LG 43-inch Smart TV",
    "تلویزیون اسمارت ال‌جی با کیفیت فول اچ‌دی، دو سال گرانتی رسمی.",
    "LG smart TV in full HD with a two-year official warranty.",
    38500, 6, discount=34900, views=940)
add("kabul-electronics", "home-electronics", "midea-fridge-260l",
    "یخچال مدیا ۲۶۰ لیتر", "Midea 260L Refrigerator",
    "یخچال دو دروازه با مصرف کم برق، مناسب فامیل چهار نفری.",
    "Two-door, low-consumption fridge suited to a family of four.",
    46000, 4, views=610)
add("kabul-electronics", "audio-video", "jbl-flip-speaker",
    "سپیکر بلوتوث جی‌بی‌ال فلیپ", "JBL Flip Bluetooth Speaker",
    "سپیکر قابل حمل ضد آب با ۱۰ ساعت بطری.", "Portable waterproof speaker with 10-hour battery.",
    4200, 18, views=1320)
add("kabul-electronics", "audio-video", "anker-powerbank-20000",
    "پاور بانک انکر ۲۰۰۰۰", "Anker 20000mAh Power Bank",
    "پاور بانک با شارژ سریع، دو پورت یو‌اس‌بی.", "Fast-charge power bank with two USB ports.",
    2400, 35, views=1580)
add("kabul-electronics", "home-electronics", "solar-panel-150w",
    "پنل آفتابی ۱۵۰ وات", "150W Solar Panel",
    "پنل آفتابی مناسب خانه، همراه با کیبل و ستند.",
    "Household solar panel supplied with cable and stand.",
    8900, 9, views=770)

# --- Markaz Mobile ---------------------------------------------------------
add("markaz-mobile", "mobiles-tablets", "samsung-galaxy-a54-128",
    "سامسونگ گلکسی A54 ۱۲۸ گیگابایت", "Samsung Galaxy A54 128GB",
    "گوشی سامسونگ گلکسی A54 با حافظه ۱۲۸ گیگابایت و کمره ۵۰ میگاپیکسل.",
    "Samsung Galaxy A54 with 128GB storage and a 50MP camera.",
    24500, 12, discount=22900,
    variants=[{"name": {"fa": "رنگ", "en": "Colour"},
               "options": [{"fa": "سیاه", "en": "Black"}, {"fa": "سفید", "en": "White"},
                           {"fa": "سبز", "en": "Green"}]}], views=2450)
add("markaz-mobile", "mobiles-tablets", "iphone-13-128",
    "آیفون ۱۳ ۱۲۸ گیگابایت", "iPhone 13 128GB",
    "آیفون ۱۳ کارکرده در حالت بسیار خوب، بطری ۹۰ فیصد.",
    "iPhone 13 in very good condition, battery health 90%.",
    58000, 3, views=3100)
add("markaz-mobile", "mobiles-tablets", "xiaomi-redmi-note-13",
    "شیائومی ردمی نوت ۱۳", "Xiaomi Redmi Note 13",
    "گوشی ردمی نوت ۱۳ با بطری ۵۰۰۰ میلی‌امپر و شارژ سریع.",
    "Redmi Note 13 with a 5000mAh battery and fast charging.",
    16800, 20, views=1890)
add("markaz-mobile", "mobiles-tablets", "samsung-tab-a9",
    "تابلت سامسونگ Tab A9", "Samsung Tab A9 Tablet",
    "تابلت ۸.۷ اینچ مناسب درس و سرگرمی اطفال.",
    "8.7-inch tablet, good for study and children's entertainment.",
    13500, 8, views=620)
add("markaz-mobile", "mobiles-tablets", "airpods-pro-2",
    "ایرپاد پرو ۲", "AirPods Pro 2",
    "ایرفون بی‌سیم با قطع صدای محیط.", "Wireless earbuds with active noise cancellation.",
    9800, 14, views=1450)
add("markaz-mobile", "mobiles-tablets", "nokia-105-classic",
    "نوکیا ۱۰۵ ساده", "Nokia 105 Classic",
    "موبایل ساده با بطری قوی، مناسب استعمال روزمره.",
    "Simple handset with long battery life for everyday use.",
    1200, 40, views=980)

# --- Bahar Cosmetics -------------------------------------------------------
add("bahar-cosmetics", "cosmetics", "maybelline-fit-me-foundation",
    "کریم پودر میبلین فیت می", "Maybelline Fit Me Foundation",
    "کریم پودر با پوشش طبیعی، مناسب پوست معمولی و چرب.",
    "Natural-coverage foundation for normal to oily skin.",
    1450, 26,
    variants=[{"name": {"fa": "شماره رنگ", "en": "Shade"},
               "options": [{"fa": "۱۱۰", "en": "110"}, {"fa": "۱۲۰", "en": "120"},
                           {"fa": "۲۲۰", "en": "220"}, {"fa": "۳۳۰", "en": "330"}]}], views=1120)
add("bahar-cosmetics", "cosmetics", "loreal-mascara-volume",
    "مسکارا لورآل ولیوم", "L'Oréal Volume Mascara",
    "مسکارا برای حجم دادن به مژه‌ها، ضد آب.", "Volumising, water-resistant mascara.",
    980, 34, views=890)
add("bahar-cosmetics", "cosmetics", "nivea-cream-blue-tin",
    "کریم نیویا قوطی آبی", "Nivea Creme Blue Tin",
    "کریم مرطوب‌کننده برای دست و روی، مناسب هوای خشک کابل.",
    "Moisturising cream for hands and face, made for Kabul's dry air.",
    380, 60, views=1340)
add("bahar-cosmetics", "cosmetics", "essence-lipstick-matte",
    "لپ‌ستیک مات اسنس", "Essence Matte Lipstick",
    "لپ‌ستیک مات با دوام طولانی در هشت رنگ.",
    "Long-wear matte lipstick in eight shades.",
    420, 48,
    variants=[{"name": {"fa": "رنگ", "en": "Shade"},
               "options": [{"fa": "سرخ کلاسیک", "en": "Classic red"},
                           {"fa": "صورتی", "en": "Pink"}, {"fa": "قهوه‌ای", "en": "Nude brown"}]}],
    views=1520)
add("bahar-cosmetics", "cosmetics", "garnier-micellar-water",
    "آب پاک‌کننده گارنیر", "Garnier Micellar Water",
    "پاک‌کننده آرایش بدون الکول، ۴۰۰ میلی‌لیتر.",
    "Alcohol-free micellar makeup remover, 400ml.",
    650, 30, views=760)
add("bahar-cosmetics", "cosmetics", "hair-oil-argan-100",
    "روغن آرگان مو ۱۰۰ میلی", "Argan Hair Oil 100ml",
    "روغن آرگان خالص برای تقویت و درخشش مو.",
    "Pure argan oil to strengthen and add shine to hair.",
    720, 25, views=540)

# --- Golden Perfumes -------------------------------------------------------
add("golden-perfumes", "perfume", "oud-royal-100ml",
    "عطر عود رویال ۱۰۰ میلی", "Oud Royal 100ml",
    "عطر شرقی با رایحه عود و عنبر، دوام بالا برای محفل شام.",
    "Oriental fragrance with oud and amber; long-lasting for evening wear.",
    3200, 15, discount=2400, views=1680)
add("golden-perfumes", "perfume", "amber-musk-50ml",
    "عطر عنبر و مشک ۵۰ میلی", "Amber & Musk 50ml",
    "ترکیب گرم عنبر و مشک سفید، مناسب هر فصل.",
    "A warm blend of amber and white musk, suitable year round.",
    1850, 22, views=720)
add("golden-perfumes", "perfume", "rose-taif-attar-12ml",
    "عطر گل سرخ طائف ۱۲ میلی", "Taif Rose Attar 12ml",
    "عطر روغنی گل سرخ طائف بدون الکول، در شیشه دستی.",
    "Alcohol-free Taif rose oil attar in a hand-blown bottle.",
    2600, 10, views=910)
add("golden-perfumes", "perfume", "bakhoor-incense-set",
    "ست بخور و عودسوز", "Bakhoor & Incense Burner Set",
    "ست بخور با عودسوز سرامیکی، مناسب تحفه.",
    "Bakhoor set with a ceramic burner — makes a good gift.",
    1400, 18, views=640)
add("golden-perfumes", "perfume", "citrus-fresh-men-100",
    "عطر مردانه سیتروس ۱۰۰ میلی", "Citrus Fresh for Men 100ml",
    "رایحه تازه مرکبات، مناسب استعمال روزانه و دفتر.",
    "Fresh citrus scent for daily and office wear.",
    1650, 28, views=1050)

# --- Noor Watches ----------------------------------------------------------
add("noor-watches", "watches", "casio-edifice-steel",
    "ساعت کاسیو ادیفایس استیل", "Casio Edifice Steel Watch",
    "ساعت مردانه کاسیو با بند استیل و کرونوگراف.",
    "Men's Casio watch with a steel bracelet and chronograph.",
    7800, 9, views=1240)
add("noor-watches", "watches", "casio-classic-leather",
    "ساعت کاسیو کلاسیک چرمی", "Casio Classic Leather Watch",
    "ساعت کلاسیک با بند چرم طبیعی، مناسب دفتر.",
    "Classic watch with a genuine leather strap for office wear.",
    3400, 16, views=880)
add("noor-watches", "watches", "seiko-automatic-5",
    "ساعت سیکو اتوماتیک ۵", "Seiko 5 Automatic Watch",
    "ساعت اتوماتیک سیکو بدون بطری، شیشه معدنی.",
    "Seiko automatic watch — no battery, mineral glass.",
    18500, 4, views=1490)
add("noor-watches", "watches", "womens-gold-tone-watch",
    "ساعت زنانه طلایی", "Women's Gold-Tone Watch",
    "ساعت زنانه با بند باریک و صفحه مینیاتوری.",
    "Women's watch with a slim bracelet and small dial.",
    2900, 20, views=1130)
add("noor-watches", "watches", "digital-sport-watch",
    "ساعت دیجیتال ورزشی", "Digital Sport Watch",
    "ساعت دیجیتال ضد آب با کرونومتر و الارم.",
    "Waterproof digital watch with stopwatch and alarm.",
    1250, 30, views=690)

# --- Ariana Clothing -------------------------------------------------------
add("ariana-clothing", "menswear", "mens-perahan-tunban-cotton",
    "پیراهن و تنبان نخی مردانه", "Men's Cotton Perahan Tunban",
    "پیراهن و تنبان نخی دوخت وطنی، مناسب هر فصل.",
    "Locally tailored cotton perahan tunban, suitable year round.",
    1850, 24,
    variants=[SIZE_CLOTHES, {"name": {"fa": "رنگ", "en": "Colour"},
                             "options": [{"fa": "کریمی", "en": "Cream"}, {"fa": "خاکی", "en": "Khaki"},
                                         {"fa": "سفید", "en": "White"}]}], views=1320)
add("ariana-clothing", "menswear", "mens-wool-blazer",
    "کوت پشمی مردانه", "Men's Wool Blazer",
    "کوت پشمی دوخت ترکی، مناسب زمستان کابل.",
    "Turkish-tailored wool blazer for Kabul winters.",
    4600, 11, variants=[SIZE_CLOTHES], views=840)
add("ariana-clothing", "womenswear", "womens-embroidered-dress",
    "پیراهن گلدوزی زنانه", "Women's Embroidered Dress",
    "پیراهن با گلدوزی دستی، مناسب محفل و عروسی.",
    "Dress with hand embroidery for celebrations and weddings.",
    5400, 8, variants=[SIZE_CLOTHES], views=1570)
add("ariana-clothing", "womenswear", "womens-wool-shawl",
    "شال پشمی زنانه", "Women's Wool Shawl",
    "شال پشمی گرم با نقش سنتی، بافت هرات.",
    "Warm wool shawl with a traditional Herat pattern.",
    1650, 32, views=1080)
add("ariana-clothing", "menswear", "mens-cotton-shirt-formal",
    "پیراهن رسمی نخی مردانه", "Men's Formal Cotton Shirt",
    "پیراهن رسمی نخی، آستین دراز، مناسب دفتر.",
    "Long-sleeve formal cotton shirt for the office.",
    1250, 40, variants=[SIZE_CLOTHES, COLOR_BASIC], views=930)
add("ariana-clothing", "womenswear", "womens-winter-coat",
    "پالتوی زمستانی زنانه", "Women's Winter Coat",
    "پالتوی گرم با آستر پشمی و جیب‌های عمیق.",
    "Warm coat with wool lining and deep pockets.",
    6200, 7, views=760)

# --- Pamir Shoes -----------------------------------------------------------
add("pamir-shoes", "shoes", "mens-leather-oxford",
    "بوت چرمی رسمی مردانه", "Men's Leather Oxford Shoes",
    "بوت چرم طبیعی با تلی چسپی، دوخت دستی.",
    "Genuine leather Oxfords with a glued sole, hand-stitched.",
    3800, 14,
    variants=[{"name": {"fa": "سایز", "en": "Size"},
               "options": [{"fa": "۴۰", "en": "40"}, {"fa": "۴۱", "en": "41"},
                           {"fa": "۴۲", "en": "42"}, {"fa": "۴۳", "en": "43"},
                           {"fa": "۴۴", "en": "44"}]}], views=1210)
add("pamir-shoes", "shoes", "nike-air-running",
    "کتان دویدن نایک ایر", "Nike Air Running Shoes",
    "کتان سبک برای دویدن و جمنازیم.", "Lightweight trainers for running and the gym.",
    5200, 10, discount=4400, views=1980)
add("pamir-shoes", "shoes", "school-shoes-black",
    "بوت مکتب سیاه", "Black School Shoes",
    "بوت مکتب مقاوم برای اطفال، سایز ۳۰ تا ۳۸.",
    "Durable school shoes for children, sizes 30–38.",
    980, 55, views=1650)
add("pamir-shoes", "shoes", "womens-flat-sandals",
    "صندل تخت زنانه", "Women's Flat Sandals",
    "صندل راحت برای تابستان، تلی نرم.", "Comfortable summer sandals with a soft sole.",
    850, 38, views=740)
add("pamir-shoes", "shoes", "winter-boots-lined",
    "بوت زمستانی آستردار", "Lined Winter Boots",
    "بوت زمستانی با آستر خزدار و تلی ضد لغزش.",
    "Winter boots with fleece lining and a non-slip sole.",
    2900, 20, views=1090)

# --- Salam Home Appliances -------------------------------------------------
add("salam-home", "kitchen-appliances", "moulinex-blender",
    "بلندر مولینکس", "Moulinex Blender",
    "بلندر ۶۰۰ وات با جار شیشه‌ای، مناسب آشپزخانه فامیلی.",
    "600W blender with a glass jar for family kitchens.",
    3400, 16, views=920)
add("salam-home", "kitchen-appliances", "pressure-cooker-7l",
    "دیگ بخار ۷ لیتر", "7L Pressure Cooker",
    "دیگ بخار المونیمی با والف امنیتی، مناسب قابلی و شوربا.",
    "Aluminium pressure cooker with a safety valve — for qabuli and shorwa.",
    2200, 24, discount=1850, views=1380)
add("salam-home", "kitchen-appliances", "electric-kettle-1-7",
    "کتری برقی ۱.۷ لیتر", "1.7L Electric Kettle",
    "کتری برقی با خاموشی خودکار.", "Electric kettle with automatic shut-off.",
    1100, 42, views=860)
add("salam-home", "kitchen-appliances", "tea-set-porcelain-12",
    "ست چای‌خوری چینی ۱۲ پارچه", "12-Piece Porcelain Tea Set",
    "ست چای‌خوری چینی با نقش گل، مناسب مهمانی.",
    "Floral porcelain tea set for guests.",
    1650, 28, views=1240)
add("salam-home", "kitchen-appliances", "non-stick-pan-28",
    "تاوه نچسپ ۲۸ سانتی", "28cm Non-Stick Pan",
    "تاوه نچسپ با دسته حرارت‌بند.", "Non-stick pan with a heat-resistant handle.",
    890, 45, views=680)
add("salam-home", "kitchen-appliances", "thermos-flask-2l",
    "فلاسک چای ۲ لیتر", "2L Tea Thermos",
    "فلاسک استیل که چای را ۱۲ ساعت گرم نگه می‌دارد.",
    "Steel thermos that keeps tea hot for 12 hours.",
    1300, 33, views=1010)

# --- Kudak Toys ------------------------------------------------------------
add("kudak-toys", "toys", "lego-classic-bricks",
    "بلاک‌های ساختمانی کلاسیک", "Classic Building Bricks",
    "بلاک‌های رنگی ۲۰۰ پارچه برای سن ۴ سال بالا.",
    "200 colourful bricks for ages 4 and up.",
    1450, 26, views=1120)
add("kudak-toys", "toys", "remote-control-car",
    "موتر ریموت‌دار", "Remote Control Car",
    "موتر ریموت‌دار شارژی با بطری قابل تبدیل.",
    "Rechargeable remote-control car with a replaceable battery.",
    1850, 18, discount=1490, views=1740)
add("kudak-toys", "toys", "wooden-puzzle-alphabet",
    "پازل چوبی الفبا", "Wooden Alphabet Puzzle",
    "پازل چوبی الفبای دری برای آموزش اطفال.",
    "Wooden Dari alphabet puzzle for early learning.",
    620, 34, views=890)
add("kudak-toys", "toys", "doll-with-clothes",
    "گدی با لباس‌های تبدیلی", "Doll with Changeable Clothes",
    "گدی با سه دست لباس و لوازم.", "Doll with three outfits and accessories.",
    980, 22, views=1050)
add("kudak-toys", "toys", "football-size-5",
    "توپ فوتبال سایز ۵", "Size 5 Football",
    "توپ فوتبال دوخت ماشینی، مناسب میدان خاکی و سمنتی.",
    "Machine-stitched football for dirt and concrete pitches.",
    750, 48, views=1320)

# --- Danesh Stationery -----------------------------------------------------
add("danesh-stationery", "stationery", "notebook-a4-200",
    "کتابچه A4 دو صد برگ", "A4 Notebook 200 Pages",
    "کتابچه خط‌دار با جلد سخت، مناسب مکتب و پوهنتون.",
    "Hardcover ruled notebook for school and university.",
    180, 120, views=1450)
add("danesh-stationery", "stationery", "pen-set-blue-10",
    "ست قلم آبی ۱۰ عدد", "Blue Pen Set of 10",
    "قلم خودکار آبی با نوشتار روان.", "Smooth-writing blue ballpoint pens.",
    150, 200, views=980)
add("danesh-stationery", "stationery", "backpack-school-navy",
    "بکس مکتب سرمه‌ای", "Navy School Backpack",
    "بکس مکتب با سه جیب و بند شانه پدینگ‌دار.",
    "School backpack with three pockets and padded straps.",
    1250, 30, discount=990, views=1680)
add("danesh-stationery", "stationery", "colour-pencils-24",
    "رنگ پنسل ۲۴ رنگ", "24 Colour Pencils",
    "رنگ پنسل چوبی با رنگ‌های روشن، برای رسامی.",
    "Wooden colour pencils in bright shades for drawing.",
    320, 70, views=760)
add("danesh-stationery", "stationery", "calculator-scientific",
    "ماشین حساب ساینتفیک", "Scientific Calculator",
    "ماشین حساب ساینتفیک ۲۴۰ فنکشن، مناسب صنف ۱۰ تا ۱۲.",
    "240-function scientific calculator for grades 10–12.",
    680, 40, views=1190)

# --- Herat Jewellery -------------------------------------------------------
add("herat-jewellery", "jewellery", "gold-ring-21k-simple",
    "انگشتر طلای ۲۱ عیار ساده", "21K Gold Ring, Plain",
    "انگشتر طلای ۲۱ عیار با وزن ۳ گرام، عیار تضمینی.",
    "21K gold ring weighing 3g with guaranteed purity.",
    28000, 5, views=1560)
add("herat-jewellery", "jewellery", "silver-necklace-lapis",
    "گردن‌بند نقره با لاجورد", "Silver Necklace with Lapis",
    "گردن‌بند نقره با سنگ لاجورد بدخشان.",
    "Silver necklace set with Badakhshan lapis lazuli.",
    4200, 12, discount=3600, views=1980)
add("herat-jewellery", "jewellery", "gold-earrings-pair",
    "گوشواره طلایی جوره", "Gold Earrings, Pair",
    "گوشواره طلای ۲۱ عیار با نقش سنتی هراتی.",
    "21K gold earrings with a traditional Herat pattern.",
    19500, 6, views=1240)
add("herat-jewellery", "jewellery", "silver-bracelet-engraved",
    "دست‌بند نقره حکاکی‌شده", "Engraved Silver Bracelet",
    "دست‌بند نقره با حکاکی دستی.", "Silver bracelet with hand engraving.",
    2800, 15, views=890)
add("herat-jewellery", "jewellery", "emerald-ring-silver",
    "انگشتر زمرد با نقره", "Emerald Ring in Silver",
    "انگشتر با سنگ زمرد پنجشیر در قالب نقره.",
    "Ring with a Panjshir emerald in a silver setting.",
    8600, 4, views=1420)

# --- Zarin Bags ------------------------------------------------------------
add("zarin-bags", "bags", "womens-handbag-leather",
    "کیف دستی چرمی زنانه", "Women's Leather Handbag",
    "کیف دستی چرم مصنوعی با بند شانه قابل تبدیل.",
    "Faux-leather handbag with a detachable shoulder strap.",
    1850, 22,
    variants=[{"name": {"fa": "رنگ", "en": "Colour"},
               "options": [{"fa": "سیاه", "en": "Black"}, {"fa": "قهوه‌ای", "en": "Brown"},
                           {"fa": "شرابی", "en": "Burgundy"}]}], views=1340)
add("zarin-bags", "bags", "travel-suitcase-24",
    "چمدان سفری ۲۴ اینچ", "24-inch Travel Suitcase",
    "چمدان چرخ‌دار با قفل رمزی و بدنه مقاوم.",
    "Wheeled suitcase with a combination lock and hard shell.",
    3900, 14, views=1120)
add("zarin-bags", "bags", "laptop-bag-15",
    "بکس لپ‌تاپ ۱۵ اینچ", "15-inch Laptop Bag",
    "بکس لپ‌تاپ با جیب پدینگ‌دار و جای شارژر.",
    "Laptop bag with a padded compartment and charger pocket.",
    1450, 26, views=980)
add("zarin-bags", "bags", "crossbody-small-bag",
    "کیف کوچک دوشی", "Small Crossbody Bag",
    "کیف کوچک برای موبایل و پول، مناسب بازار.",
    "Small bag for phone and cash — handy for the bazaar.",
    650, 40, views=760)
add("zarin-bags", "bags", "duffel-gym-bag",
    "بکس ورزشی داف‌بگ", "Gym Duffel Bag",
    "بکس ورزشی با جیب جداگانه برای بوت.",
    "Gym bag with a separate shoe compartment.",
    1250, 30, views=640)

# --- Alborz Sportswear -----------------------------------------------------
add("alborz-sports", "sportswear", "tracksuit-mens-navy",
    "ترنگ ورزشی مردانه", "Men's Tracksuit",
    "ترنگ ورزشی دو پارچه، جنس نرم و گرم.",
    "Two-piece tracksuit in a soft, warm fabric.",
    2400, 20, variants=[SIZE_CLOTHES], views=1180)
add("alborz-sports", "sportswear", "cricket-bat-kashmir",
    "بت کرکت کشمیری", "Kashmir Willow Cricket Bat",
    "بت کرکت از چوب کشمیری با گریپ اضافی.",
    "Kashmir willow cricket bat supplied with a spare grip.",
    3200, 12, discount=2750, views=2140)
add("alborz-sports", "sportswear", "football-jersey-team",
    "جرسی فوتبال تیمی", "Team Football Jersey",
    "جرسی فوتبال با جنس خنک، مناسب تمرین و مسابقه.",
    "Breathable football jersey for training and matches.",
    950, 45, variants=[SIZE_CLOTHES], views=1620)
add("alborz-sports", "sportswear", "dumbbell-set-10kg",
    "ست دمبل ۱۰ کیلو", "10kg Dumbbell Set",
    "ست دمبل با وزنه‌های قابل تبدیل.", "Dumbbell set with adjustable plates.",
    2800, 10, views=890)
add("alborz-sports", "sportswear", "yoga-mat-6mm",
    "متریس یوگا ۶ ملی‌متر", "6mm Yoga Mat",
    "متریس یوگا ضد لغزش با بند حمل.",
    "Non-slip yoga mat with a carry strap.",
    780, 26, views=540)

# --- Kabul Dried Fruit & Sweets (PENDING shop — products stay draft) -------
add("kabul-dried-fruit", "dried-fruit-sweets", "pistachio-roasted-1kg",
    "پسته بریان یک کیلو", "Roasted Pistachios 1kg",
    "پسته بریان و نمکی از هرات، تازه بریان‌شده.",
    "Salted roasted pistachios from Herat, freshly roasted.",
    1450, 30, views=0)
add("kabul-dried-fruit", "dried-fruit-sweets", "almond-qahqaha-1kg",
    "بادام قهقهه یک کیلو", "Qahqaha Almonds 1kg",
    "بادام قهقهه کندهاری با مغز پر و شیرین.",
    "Kandahar Qahqaha almonds — full, sweet kernels.",
    1200, 25, views=0)
add("kabul-dried-fruit", "dried-fruit-sweets", "raisin-green-1kg",
    "کشمش سبز یک کیلو", "Green Raisins 1kg",
    "کشمش سبز شمالی، خشک‌شده در سایه.",
    "Northern green raisins, shade-dried.",
    650, 40, views=0)
add("kabul-dried-fruit", "dried-fruit-sweets", "walnut-shelled-1kg",
    "مغز چارمغز یک کیلو", "Shelled Walnuts 1kg",
    "مغز چارمغز تازه از پروان.", "Fresh shelled walnuts from Parwan.",
    980, 22, views=0)
add("kabul-dried-fruit", "dried-fruit-sweets", "sweets-gift-box",
    "بکس تحفه‌ای شیرینی", "Sweets Gift Box",
    "بکس تحفه‌ای با شیرینی خانگی و نقل، مناسب عید.",
    "Gift box of homemade sweets and noql, right for Eid.",
    1350, 18, views=0)
add("kabul-dried-fruit", "dried-fruit-sweets", "dried-apricot-1kg",
    "زردالو خشک یک کیلو", "Dried Apricots 1kg",
    "زردالوی خشک بی‌دانه از بامیان.", "Pitted dried apricots from Bamyan.",
    850, 28, views=0)

# ---------------------------------------------------------------------------
(OUT / "categories.json").write_text(json.dumps(CATEGORIES, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(OUT / "shops.json").write_text(json.dumps(SHOPS, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(OUT / "products.json").write_text(json.dumps(P, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

by_shop = {}
for item in P:
    by_shop[item["shopSlug"]] = by_shop.get(item["shopSlug"], 0) + 1

print(f"categories: {len(CATEGORIES)} parents, {sum(len(c['children']) for c in CATEGORIES)} children")
print(f"shops: {len(SHOPS)} ({sum(1 for s in SHOPS if s.get('status') == 'pending')} pending)")
print(f"products: {len(P)}")
print(f"  discounted: {sum(1 for p in P if p['discountPrice'])}")
print(f"  with variants: {sum(1 for p in P if p['variants'])}")
print(f"  per shop: {by_shop}")

missing = [p['slug'] for p in P if p['shopSlug'] not in {s['slug'] for s in SHOPS}]
assert not missing, f"products reference unknown shops: {missing}"
child_slugs = {c['slug'] for parent in CATEGORIES for c in parent['children']}
bad_cat = [p['slug'] for p in P if p['categorySlug'] not in child_slugs]
assert not bad_cat, f"products reference unknown categories: {bad_cat}"
bad_shop_cat = [s['slug'] for s in SHOPS if s['category'] not in child_slugs | {c['slug'] for c in CATEGORIES}]
assert not bad_shop_cat, f"shops reference unknown categories: {bad_shop_cat}"
print("✓ referential integrity checks passed")
