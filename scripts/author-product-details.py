#!/usr/bin/env python3
"""
Authors content/seed/product-details.json — specifications, features, brand and
model, plus a real description paragraph, for every seeded product (Prompt P1).

A generator rather than hand-edited JSON for the same reason
author-seed-content.py is: 75 products across 16 categories have to describe
themselves with the SAME spec keys or the comparison table in P3 has nothing to
line up, and a hand-edited file drifts on the third edit.

The CONTENT is hand-written. Values are plausible Kabul retail — a shop's own
warranty rather than a manufacturer's, sizes that a Gulbahar tenant actually
stocks, origins that match how these goods reach Kabul. Every string is written
in Dari and English; nothing is transliterated placeholder text, because
lorem in a spec table is the fastest way for a client to stop believing the
rest of the screen.

Rows carry only `key` and `value`. The LABEL comes from the category template in
lib/product-templates.ts at seed time, so the vocabulary has one definition
rather than two that drift — a row whose key is not in its category's template
carries its own label here instead.

Run: python3 scripts/author-product-details.py
"""
import json
import pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "content" / "seed"

DETAILS: dict = {}


def P(slug, *, desc, attrs, features, brand=None, model=None):
    """One product. attrs: (key, fa, en). features: (title_fa, title_en, body_fa, body_en)."""
    DETAILS[slug] = {
        "brand": brand,
        "model": model,
        "description": {"fa": desc[0], "en": desc[1]},
        "attributes": [{"key": k, "value": {"fa": fa, "en": en}} for k, fa, en in attrs],
        "features": [
            {"title": {"fa": tf, "en": te}, "body": {"fa": bf, "en": be}}
            for tf, te, bf, be in features
        ],
    }


WARRANTY_SHOP_12 = ("warranty", "۱۲ ماه گرانتی دکان", "12 months, shop warranty")
WARRANTY_SHOP_24 = ("warranty", "۲۴ ماه گرانتی دکان", "24 months, shop warranty")
WARRANTY_SHOP_6 = ("warranty", "۶ ماه گرانتی دکان", "6 months, shop warranty")

# ---------------------------------------------------------------------------
# الکترونیک کابل — Kabul Electronics
# ---------------------------------------------------------------------------

P(
    "lg-tv-43-smart",
    brand="LG",
    model="43LM5500",
    desc=(
        "تلویزیون ۴۳ اینچ ال‌جی با صفحه فول اچ‌دی و سیستم عامل هوشمند، برای دیدن فلم و "
        "سریال بدون نیاز به دستگاه جداگانه. اتصال وای‌فای و دو ورودی HDMI دارد و "
        "می‌توانید یوتیوب و برنامه‌های پخش را مستقیم روی خود تلویزیون باز کنید. "
        "دکان دو سال گرانتی می‌دهد و نصب روی دیوار در شهر کابل رایگان است.",
        "A 43-inch LG television with a full HD panel and a smart operating system, so "
        "films and series play without a separate box. It carries Wi-Fi and two HDMI "
        "inputs, and YouTube and streaming apps open on the set itself. The shop gives "
        "a two-year warranty, and wall mounting inside Kabul is free.",
    ),
    attrs=[
        ("brand", "ال‌جی", "LG"),
        ("model", "43LM5500", "43LM5500"),
        ("capacity", "۴۳ اینچ، فول اچ‌دی ۱۹۲۰×۱۰۸۰", '43", full HD 1920×1080'),
        ("power", "۷۵ وات", "75 W"),
        ("size", "۹۷ × ۵۷ × ۸ سانتی‌متر", "97 × 57 × 8 cm"),
        WARRANTY_SHOP_24,
    ],
    features=[
        ("سیستم هوشمند", "Smart system", "یوتیوب و برنامه‌های پخش روی خود تلویزیون باز می‌شوند.", "YouTube and streaming apps run on the set itself."),
        ("دو ورودی HDMI", "Two HDMI inputs", "برای رسیور، کنسول بازی یا لپ‌تاپ، بدون تعویض کیبل.", "For a receiver, a console or a laptop, with no swapping of cables."),
        ("نصب رایگان", "Free mounting", "نصب روی دیوار در داخل شهر کابل رایگان است.", "Wall mounting anywhere inside Kabul is included."),
        ("دو سال گرانتی", "Two-year warranty", "گرانتی دکان، با سرویس در همان مرکز گلبهار.", "Shop warranty, serviced here in Gulbahar Center."),
    ],
)

P(
    "midea-fridge-260l",
    brand="Midea",
    model="HD-333FWEN",
    desc=(
        "یخچال ۲۶۰ لیتری میدیا با فریزر بالا، مناسب یک فامیل چهار تا شش نفره. "
        "سیستم بدون برفک دارد، پس هر چند ماه یک‌بار دیفراست کردن لازم نیست. "
        "کم‌مصرف است و در نوسان برق کابل با استبلایزر بدون مشکل کار می‌کند.",
        "A 260-litre Midea fridge with a top freezer, sized for a family of four to six. "
        "It is frost-free, so there is no defrosting every few months. Consumption is "
        "low, and with a stabiliser it copes with Kabul's mains fluctuations.",
    ),
    attrs=[
        ("brand", "میدیا", "Midea"),
        ("model", "HD-333FWEN", "HD-333FWEN"),
        ("capacity", "۲۶۰ لیتر — یخچال ۱۹۰، فریزر ۷۰", "260 L — 190 fridge, 70 freezer"),
        ("power", "۱۳۰ وات", "130 W"),
        ("size", "۱۵۵ × ۵۵ × ۶۰ سانتی‌متر", "155 × 55 × 60 cm"),
        WARRANTY_SHOP_24,
    ],
    features=[
        ("بدون برفک", "Frost-free", "فریزر خودش برفک را آب می‌کند؛ دیفراست دستی لازم نیست.", "The freezer clears its own ice; no manual defrosting."),
        ("کم‌مصرف", "Low consumption", "۱۳۰ وات — با جنراتور خانگی هم کار می‌کند.", "At 130 W it runs from a household generator too."),
        ("قفسه‌های شیشه‌ای", "Glass shelves", "قفسه‌ها قابل تنظیم و شستشو هستند.", "Shelves are adjustable and wipe clean."),
    ],
)

P(
    "jbl-flip-speaker",
    brand="JBL",
    model="Flip 6",
    desc=(
        "سپیکر بلوتوث جی‌بی‌ال با صدای بلند و باس قوی، در اندازه‌ای که در کیف جا می‌شود. "
        "باتری تا ۱۲ ساعت پخش می‌دهد و بدنه ضد آب است، پس برای سفر و پیک‌نیک مناسب است. "
        "با یک شارژ کامل یک روز کامل مهمانی را می‌گذراند.",
        "A JBL Bluetooth speaker with real volume and a strong low end, in a size that "
        "fits a bag. The battery runs up to 12 hours and the body is waterproof, which "
        "makes it a travel and picnic speaker. One full charge covers a whole day.",
    ),
    attrs=[
        ("brand", "جی‌بی‌ال", "JBL"),
        ("model", "Flip 6", "Flip 6"),
        ("battery", "۴۸۰۰ میلی‌آمپر — تا ۱۲ ساعت", "4800 mAh — up to 12 hours"),
        ("connectivity", "بلوتوث ۵.۱ و کیبل AUX", "Bluetooth 5.1 and AUX"),
        ("power", "۲۰ وات", "20 W"),
        WARRANTY_SHOP_12,
    ],
    features=[
        ("ضد آب", "Waterproof", "بدنه IPX7 — باران و آب‌پاشی مشکلی ندارد.", "An IPX7 body shrugs off rain and splashes."),
        ("۱۲ ساعت پخش", "12 hours of play", "یک شارژ برای یک روز کامل بس است.", "One charge lasts a full day out."),
        ("جفت‌شدن دوتایی", "Pair two together", "دو سپیکر را می‌توانید با هم جفت کنید.", "Two units pair for stereo."),
    ],
)

P(
    "anker-powerbank-20000",
    brand="Anker",
    model="PowerCore 20000",
    desc=(
        "پاوربانک ۲۰۰۰۰ میلی‌آمپری انکر که موبایل معمولی را چهار تا پنج بار شارژ می‌کند. "
        "دو خروجی USB دارد، پس دو گوشی هم‌زمان شارژ می‌شوند. "
        "برای روزهای قطع برق و سفرهای بین‌شهری ساخته شده است.",
        "A 20000mAh Anker power bank that refills an ordinary phone four to five times. "
        "Two USB outputs mean two phones charge at once. Built for power cuts and "
        "long road trips.",
    ),
    attrs=[
        ("brand", "انکر", "Anker"),
        ("model", "PowerCore 20000", "PowerCore 20000"),
        ("battery", "۲۰۰۰۰ میلی‌آمپر", "20000 mAh"),
        ("connectivity", "دو خروجی USB-A و ورودی USB-C", "Two USB-A outputs, USB-C input"),
        ("power", "۱۸ وات شارژ سریع", "18 W fast charge"),
        WARRANTY_SHOP_12,
    ],
    features=[
        ("چهار بار شارژ", "Four full charges", "یک موبایل معمولی را چهار تا پنج بار پر می‌کند.", "Refills an ordinary phone four to five times."),
        ("دو خروجی", "Two outputs", "دو گوشی هم‌زمان و بدون افت سرعت.", "Two phones at once with no drop in speed."),
        ("شارژ سریع", "Fast charge", "۱۸ وات — نیم ساعت برای نصف باتری.", "18 W puts half a battery back in thirty minutes."),
    ],
)

P(
    "solar-panel-150w",
    brand="Jinko",
    model="JKM150M",
    desc=(
        "پنل آفتابی ۱۵۰ واتی مونوکریستال برای خانه‌هایی که برق شهری‌شان قطع و وصل می‌شود. "
        "با یک باتری و انورتر، چراغ‌ها، تلویزیون و شارژ موبایل یک خانه را می‌گرداند. "
        "قاب آلومینیمی و شیشه سکوریت دارد و برای زمستان کابل ساخته شده است.",
        "A 150-watt monocrystalline solar panel for homes where the mains comes and "
        "goes. With one battery and an inverter it runs a household's lights, "
        "television and phone charging. The aluminium frame and tempered glass are "
        "built for a Kabul winter.",
    ),
    attrs=[
        ("brand", "جینکو", "Jinko"),
        ("model", "JKM150M", "JKM150M"),
        ("capacity", "۱۵۰ وات", "150 W"),
        ("power", "۱۸ ولت — خروجی DC", "18 V DC output"),
        ("size", "۱۴۸ × ۶۷ × ۳.۵ سانتی‌متر", "148 × 67 × 3.5 cm"),
        WARRANTY_SHOP_12,
    ],
    features=[
        ("مونوکریستال", "Monocrystalline", "بازدهی بیشتر در همان اندازه نسبت به پنل پلی.", "More output than a poly panel of the same size."),
        ("قاب آلومینیمی", "Aluminium frame", "زنگ نمی‌زند و وزن آن روی بام کم است.", "It does not rust and sits light on a roof."),
        ("مقاوم در برابر ژاله", "Hail rated", "شیشه سکوریت، آزمایش‌شده برای ژاله.", "Tempered glass, tested against hail."),
    ],
)

# ---------------------------------------------------------------------------
# مرکز موبایل — Markaz Mobile
# ---------------------------------------------------------------------------

P(
    "samsung-galaxy-a54-128",
    brand="Samsung",
    model="Galaxy A54 5G",
    desc=(
        "گلکسی A54 با صفحه سوپر آمولد ۶.۴ اینچ و کمره ۵۰ مگاپیکسلی، انتخاب میانه‌رده "
        "سامسونگ برای کسی که عکس خوب و باتری یک‌روزه می‌خواهد. "
        "۱۲۸ گیگابایت حافظه و ۸ گیگابایت رم دارد و جای کارت حافظه هم باز است. "
        "دستگاه اصل با گرانتی دکان و رهنمایی رایگان برای انتقال اطلاعات از گوشی قبلی.",
        "The Galaxy A54 pairs a 6.4-inch Super AMOLED screen with a 50 MP camera — "
        "Samsung's mid-range answer for someone who wants good photographs and a "
        "battery that lasts the day. It has 128 GB of storage, 8 GB of memory and a "
        "free memory-card slot. Genuine stock with shop warranty, and we move your "
        "data across from the old phone at no charge.",
    ),
    attrs=[
        ("brand", "سامسونگ", "Samsung"),
        ("model", "Galaxy A54 5G", "Galaxy A54 5G"),
        ("storage", "۱۲۸ گیگابایت", "128 GB"),
        ("ram", "۸ گیگابایت", "8 GB"),
        ("screen", "۶.۴ اینچ Super AMOLED، ۱۲۰ هرتز", "6.4-inch Super AMOLED, 120 Hz"),
        ("battery", "۵۰۰۰ میلی‌آمپر", "5000 mAh"),
        ("camera", "۵۰ + ۱۲ + ۵ مگاپیکسل", "50 + 12 + 5 MP"),
        WARRANTY_SHOP_12,
    ],
    features=[
        ("باتری یک‌روزه", "A full day of battery", "۵۰۰۰ میلی‌آمپر — با استفاده معمولی تا شب می‌رسد.", "5000 mAh gets through the evening on ordinary use."),
        ("کمره ۵۰ مگاپیکسل", "50 MP camera", "عکس‌های شب با نویز کم و رنگ طبیعی.", "Night shots with low noise and natural colour."),
        ("جای کارت حافظه", "Memory-card slot", "تا ۱ ترابایت حافظه اضافه می‌شود.", "Up to 1 TB of extra storage."),
        ("انتقال رایگان اطلاعات", "Free data transfer", "شماره‌ها و عکس‌های گوشی قبلی را ما منتقل می‌کنیم.", "We move your contacts and photos from the old phone."),
    ],
)

P(
    "iphone-13-128",
    brand="Apple",
    model="iPhone 13",
    desc=(
        "آیفون ۱۳ با چیپ A15 و صفحه Super Retina XDR، هنوز یکی از روان‌ترین گوشی‌های بازار. "
        "کمره دوگانه ۱۲ مگاپیکسلی با حالت سینمایی، و باتری‌ای که یک روز کاری کامل دوام می‌آورد. "
        "دستگاه اصل، کارکرد صفر، با گرانتی دکان و بررسی سلامت باتری در حضور خودتان.",
        "The iPhone 13 pairs the A15 chip with a Super Retina XDR display and is still "
        "one of the smoothest phones on the shelf. The dual 12 MP camera shoots "
        "cinematic mode, and the battery covers a full working day. Genuine, unused "
        "stock with shop warranty, and we check battery health in front of you.",
    ),
    attrs=[
        ("brand", "اپل", "Apple"),
        ("model", "iPhone 13", "iPhone 13"),
        ("storage", "۱۲۸ گیگابایت", "128 GB"),
        ("ram", "۴ گیگابایت", "4 GB"),
        ("screen", "۶.۱ اینچ Super Retina XDR", "6.1-inch Super Retina XDR"),
        ("battery", "۳۲۴۰ میلی‌آمپر", "3240 mAh"),
        ("camera", "۱۲ + ۱۲ مگاپیکسل", "12 + 12 MP"),
        WARRANTY_SHOP_12,
    ],
    features=[
        ("چیپ A15", "A15 chip", "بازی و ویرایش ویدیو بدون کندی.", "Games and video editing without a stutter."),
        ("حالت سینمایی", "Cinematic mode", "ویدیو با فوکوس نرم، مثل کمره‌های حرفه‌ای.", "Video with a soft focus pull, like a proper camera."),
        ("بررسی باتری", "Battery check", "سلامت باتری را پیش روی خودتان نشان می‌دهیم.", "We show you the battery health before you pay."),
    ],
)

P(
    "xiaomi-redmi-note-13",
    brand="Xiaomi",
    model="Redmi Note 13",
    desc=(
        "ردمی نوت ۱۳ بهترین نسبت قیمت به کارایی در این قفسه است: صفحه آمولد ۶.۶۷ اینچ، "
        "کمره ۱۰۸ مگاپیکسلی و باتری ۵۰۰۰ که با شارژ سریع ۳۳ واتی در یک ساعت پر می‌شود. "
        "۱۲۸ گیگابایت حافظه و ۶ گیگابایت رم برای استفاده روزمره کاملاً کافی است.",
        "The Redmi Note 13 is the best value on this shelf: a 6.67-inch AMOLED screen, "
        "a 108 MP camera and a 5000 mAh battery that refills in about an hour on 33 W "
        "charging. With 128 GB of storage and 6 GB of memory it is more than enough "
        "for everyday use.",
    ),
    attrs=[
        ("brand", "شیائومی", "Xiaomi"),
        ("model", "Redmi Note 13", "Redmi Note 13"),
        ("storage", "۱۲۸ گیگابایت", "128 GB"),
        ("ram", "۶ گیگابایت", "6 GB"),
        ("screen", "۶.۶۷ اینچ AMOLED، ۱۲۰ هرتز", "6.67-inch AMOLED, 120 Hz"),
        ("battery", "۵۰۰۰ میلی‌آمپر، شارژ ۳۳ وات", "5000 mAh, 33 W charging"),
        ("camera", "۱۰۸ + ۸ + ۲ مگاپیکسل", "108 + 8 + 2 MP"),
        WARRANTY_SHOP_12,
    ],
    features=[
        ("شارژ سریع ۳۳ وات", "33 W fast charge", "از صفر تا صد در حدود یک ساعت.", "Empty to full in around an hour."),
        ("کمره ۱۰۸ مگاپیکسل", "108 MP camera", "جزئیات زیاد، حتی وقتی عکس را بزرگ می‌کنید.", "Detail that survives cropping."),
        ("دو سیم‌کارت", "Dual SIM", "دو شماره فعال، بدون تعویض سیم‌کارت.", "Two active numbers with no swapping."),
    ],
)

P(
    "samsung-tab-a9",
    brand="Samsung",
    model="Galaxy Tab A9",
    desc=(
        "تابلت گلکسی A9 با صفحه ۸.۷ اینچ، اندازه‌ای که در یک دست جا می‌شود. "
        "برای درس آنلاین، خواندن و تماشای ویدیو ساخته شده و باتری ۵۱۰۰ چند ساعت پخش می‌دهد. "
        "جای سیم‌کارت هم دارد، پس بدون وای‌فای هم به انترنت وصل می‌شود.",
        "The Galaxy Tab A9 has an 8.7-inch screen — a size that sits in one hand. It is "
        "made for online classes, reading and video, and the 5100 mAh battery gives "
        "several hours of playback. A SIM slot means it reaches the internet without "
        "Wi-Fi too.",
    ),
    attrs=[
        ("brand", "سامسونگ", "Samsung"),
        ("model", "Galaxy Tab A9", "Galaxy Tab A9"),
        ("storage", "۶۴ گیگابایت", "64 GB"),
        ("ram", "۴ گیگابایت", "4 GB"),
        ("screen", "۸.۷ اینچ TFT", "8.7-inch TFT"),
        ("battery", "۵۱۰۰ میلی‌آمپر", "5100 mAh"),
        WARRANTY_SHOP_12,
    ],
    features=[
        ("جای سیم‌کارت", "SIM slot", "بدون وای‌فای هم انترنت دارد.", "Data without a Wi-Fi network."),
        ("اندازه یک‌دستی", "One-hand size", "۸.۷ اینچ — برای صنف آنلاین و خواندن.", "8.7 inches, for online class and reading."),
        ("حالت اطفال", "Kids mode", "محدودسازی وقت و برنامه‌ها برای اطفال.", "Time and app limits for children."),
    ],
)

P(
    "airpods-pro-2",
    brand="Apple",
    model="AirPods Pro 2",
    desc=(
        "ایرپاد پرو ۲ با حذف نویز فعال، که سر و صدای موتر و بازار را واقعاً کم می‌کند. "
        "حالت شفاف هم دارد تا وقتی لازم است صدای اطراف را بشنوید. "
        "با کیس، تا ۳۰ ساعت پخش می‌دهد و دستگاه اصل با گرانتی دکان است.",
        "AirPods Pro 2 with active noise cancellation that genuinely takes the traffic "
        "and the bazaar down. Transparency mode lets the street back in when you need "
        "it. With the case they run up to 30 hours, and this is genuine stock with "
        "shop warranty.",
    ),
    attrs=[
        ("brand", "اپل", "Apple"),
        ("model", "AirPods Pro 2", "AirPods Pro 2"),
        ("battery", "۶ ساعت — با کیس تا ۳۰ ساعت", "6 hours — 30 with the case"),
        ("connectivity", "بلوتوث ۵.۳", "Bluetooth 5.3"),
        WARRANTY_SHOP_12,
    ],
    features=[
        ("حذف نویز فعال", "Active noise cancellation", "صدای موتر و جنراتور را تا حد زیادی می‌برد.", "Takes out most of the traffic and generator noise."),
        ("حالت شفاف", "Transparency mode", "بدون درآوردن ایرپاد، صدای اطراف را می‌شنوید.", "Hear the street without taking them out."),
        ("کیس شارژ", "Charging case", "تا ۳۰ ساعت پخش با کیس.", "Up to 30 hours of listening with the case."),
    ],
)

P(
    "nokia-105-classic",
    brand="Nokia",
    model="105 Classic",
    desc=(
        "نوکیا ۱۰۵، همان گوشی ساده و محکمی که باتری‌اش هفته‌ها دوام می‌آورد. "
        "دو سیم‌کارت، رادیو FM و چراغ قوه دارد و برای تماس و پیام کاملاً کافی است. "
        "به‌عنوان گوشی دوم، گوشی کار یا گوشی سفر انتخاب مطمئنی است.",
        "The Nokia 105 — the plain, tough handset whose battery lasts weeks. Dual SIM, "
        "FM radio and a torch, and it does calls and messages perfectly well. A sound "
        "choice as a second phone, a work phone or a travel phone.",
    ),
    attrs=[
        ("brand", "نوکیا", "Nokia"),
        ("model", "105 Classic", "105 Classic"),
        ("screen", "۱.۸ اینچ رنگی", "1.8-inch colour"),
        ("battery", "۸۰۰ میلی‌آمپر — تا ۲ هفته آماده‌باش", "800 mAh — up to two weeks standby"),
        WARRANTY_SHOP_6,
    ],
    features=[
        ("باتری هفتگی", "Weeks of standby", "با یک شارژ تا دو هفته در حالت آماده‌باش.", "Up to two weeks of standby on one charge."),
        ("دو سیم‌کارت", "Dual SIM", "دو شماره در یک گوشی.", "Two numbers in one handset."),
        ("چراغ قوه", "Torch", "برای شب‌های بدون برق.", "For nights without power."),
    ],
)

# ---------------------------------------------------------------------------
# آرایشی بهار — Bahar Cosmetics
# ---------------------------------------------------------------------------

P(
    "maybelline-fit-me-foundation",
    brand="Maybelline",
    desc=(
        "فوندیشن فیت می میبلین با پوشش متوسط و ماتی طبیعی، بدون اینکه صورت را نقاب‌مانند کند. "
        "برای پوست چرب و مختلط ساخته شده و تا آخر روز روی پوست می‌ماند. "
        "رنگ‌های موجود با پوست‌های روشن تا گندمی سازگار است؛ در دکان تست رنگ می‌کنیم.",
        "Maybelline Fit Me foundation gives medium coverage with a natural matte "
        "finish, without turning the face into a mask. It is made for oily and "
        "combination skin and holds through the day. The shades on the shelf suit "
        "light to olive skin — we match the shade in the shop.",
    ),
    attrs=[
        ("brand", "میبلین", "Maybelline"),
        ("volume", "۳۰ میلی‌لیتر", "30 ml"),
        ("type", "فوندیشن مایع، پوشش متوسط", "Liquid foundation, medium coverage"),
        ("skinType", "چرب و مختلط", "Oily and combination"),
        ("origin", "امارات", "UAE"),
    ],
    features=[
        ("ماتی طبیعی", "Natural matte", "براقی را می‌گیرد بدون اینکه خشک نشان دهد.", "Takes the shine down without looking dry."),
        ("تست رنگ در دکان", "Shade matched in store", "پیش از خرید روی پوست خودتان امتحان می‌شود.", "Tried on your own skin before you buy."),
        ("ماندگاری روزانه", "All-day wear", "تا آخر وقت اداری روی پوست می‌ماند.", "Holds to the end of an office day."),
    ],
)

P(
    "loreal-mascara-volume",
    brand="L'Oréal",
    desc=(
        "ریمل حجم‌دهنده لورآل با برس مخروطی که مژه‌های کنار چشم را هم می‌گیرد. "
        "فرمول آن پخش نمی‌شود و در گرمای تابستان زیر چشم نمی‌ریزد. "
        "با آب گرم و شوینده معمولی پاک می‌شود و نیازی به پاک‌کننده مخصوص ندارد.",
        "L'Oréal volumising mascara with a tapered brush that reaches the lashes at "
        "the corner of the eye. The formula does not run and will not smudge under "
        "the eye in summer heat. It comes off with warm water and ordinary cleanser — "
        "no special remover needed.",
    ),
    attrs=[
        ("brand", "لورآل", "L'Oréal"),
        ("volume", "۹.۵ میلی‌لیتر", "9.5 ml"),
        ("type", "ریمل حجم‌دهنده", "Volumising mascara"),
        ("skinType", "همه، مناسب چشم حساس", "All, safe for sensitive eyes"),
        ("origin", "فرانسه", "France"),
    ],
    features=[
        ("برس مخروطی", "Tapered brush", "مژه‌های کوتاه گوشه چشم را هم می‌گیرد.", "Catches the short lashes in the corner."),
        ("بدون ریزش", "No smudging", "در گرما هم زیر چشم پخش نمی‌شود.", "Stays put under the eye in the heat."),
        ("پاک‌شدن آسان", "Easy to remove", "با آب گرم پاک می‌شود.", "Warm water is enough."),
    ],
)

P(
    "nivea-cream-blue-tin",
    brand="Nivea",
    desc=(
        "کریم نیوآ در همان قوطی آبی همیشگی — برای دست، صورت و پاشنه پا در زمستان کابل. "
        "غلیظ است و کم مصرف می‌شود؛ یک قوطی یک زمستان کامل دوام می‌آورد. "
        "بدون رنگ و مواد نگهدارنده تند، مناسب پوست اطفال هم هست.",
        "Nivea creme in the same blue tin — for hands, face and cracked heels through "
        "a Kabul winter. It is thick and goes a long way; one tin lasts the season. "
        "No dyes and no harsh preservatives, so it suits children's skin as well.",
    ),
    attrs=[
        ("brand", "نیوآ", "Nivea"),
        ("volume", "۱۵۰ میلی‌لیتر", "150 ml"),
        ("type", "کریم مرطوب‌کننده غلیظ", "Rich moisturising creme"),
        ("skinType", "خشک و بسیار خشک", "Dry and very dry"),
        ("origin", "آلمان", "Germany"),
    ],
    features=[
        ("برای زمستان", "Made for winter", "ترک دست و پاشنه پا را ترمیم می‌کند.", "Repairs cracked hands and heels."),
        ("کم‌مصرف", "A little goes far", "یک قوطی یک زمستان کامل بس است.", "One tin lasts a whole season."),
        ("مناسب اطفال", "Safe for children", "بدون رنگ و بوی تند.", "No dyes, no strong perfume."),
    ],
)

P(
    "essence-lipstick-matte",
    brand="Essence",
    desc=(
        "لپ‌ستیک مات اسنس با بافت نرم که لب را خشک نمی‌کند. "
        "رنگ‌دهی در یک بار کشیدن کامل است و تا چند ساعت می‌ماند. "
        "قیمت آن پایین است، پس می‌توانید چند رنگ داشته باشید بدون اینکه گران تمام شود.",
        "An Essence matte lipstick with a soft texture that does not dry the lip. One "
        "pass gives full colour and it holds for several hours. The price is low "
        "enough to keep a few shades without it adding up.",
    ),
    attrs=[
        ("brand", "اسنس", "Essence"),
        ("volume", "۳.۵ گرام", "3.5 g"),
        ("type", "لپ‌ستیک مات", "Matte lipstick"),
        ("skinType", "همه", "All"),
        ("origin", "آلمان", "Germany"),
    ],
    features=[
        ("مات بدون خشکی", "Matte, not drying", "بافت نرم با روغن‌های مرطوب‌کننده.", "A soft texture with conditioning oils."),
        ("یک لایه کافی است", "One pass is enough", "رنگ‌دهی کامل بدون تکرار.", "Full colour without going over it."),
        ("چند رنگ موجود", "Several shades", "از نود روزمره تا سرخ مجلسی.", "From everyday nude to an evening red."),
    ],
)

P(
    "garnier-micellar-water",
    brand="Garnier",
    desc=(
        "میسلار واتر گارنیه که آرایش را بدون مالیدن و کشیدن پوست پاک می‌کند. "
        "برای پاک کردن ریمل و خط چشم هم کافی است و نیازی به آب کشیدن ندارد. "
        "بدون الکل است، پس پوست حساس را نمی‌سوزاند.",
        "Garnier micellar water lifts make-up off without rubbing or dragging at the "
        "skin. It takes mascara and eyeliner off too, and needs no rinsing. Alcohol "
        "free, so it does not sting sensitive skin.",
    ),
    attrs=[
        ("brand", "گارنیه", "Garnier"),
        ("volume", "۴۰۰ میلی‌لیتر", "400 ml"),
        ("type", "پاک‌کننده آرایش", "Make-up remover"),
        ("skinType", "حساس و همه پوست‌ها", "Sensitive and all types"),
        ("origin", "فرانسه", "France"),
    ],
    features=[
        ("بدون الکل", "Alcohol free", "پوست حساس را نمی‌سوزاند.", "Does not sting sensitive skin."),
        ("بدون آب‌کشی", "No rinsing", "بعد از پاک کردن نیازی به شستن نیست.", "No need to wash it off afterwards."),
        ("حجم بزرگ", "Large bottle", "۴۰۰ میلی‌لیتر — چند ماه استفاده.", "400 ml — several months of use."),
    ],
)

P(
    "hair-oil-argan-100",
    brand="Argan",
    desc=(
        "روغن آرگان خالص برای موهای خشک و آسیب‌دیده، مخصوصاً بعد از رنگ یا صافی. "
        "چند قطره روی نوک موها کافی است؛ چرب نمی‌کند و بوی سنگین ندارد. "
        "در خشکی هوای کابل، موخوره و وز شدن مو را به مرور کم می‌کند.",
        "Pure argan oil for dry and damaged hair, especially after colouring or "
        "straightening. A few drops on the ends is enough; it does not leave hair "
        "greasy and has no heavy scent. In Kabul's dry air it takes down split ends "
        "and frizz over a few weeks.",
    ),
    attrs=[
        ("brand", "آرگان", "Argan"),
        ("volume", "۱۰۰ میلی‌لیتر", "100 ml"),
        ("type", "روغن مو", "Hair oil"),
        ("skinType", "موی خشک و آسیب‌دیده", "Dry and damaged hair"),
        ("origin", "مراکش", "Morocco"),
    ],
    features=[
        ("چند قطره کافی است", "A few drops", "یک شیشه چند ماه دوام می‌آورد.", "One bottle lasts months."),
        ("بدون چربی", "Not greasy", "روی مو سنگینی نمی‌کند.", "It does not weigh hair down."),
        ("ضد وز", "Anti-frizz", "در هوای خشک مو را رام می‌کند.", "Tames hair in dry air."),
    ],
)

# ---------------------------------------------------------------------------
# عطریات طلایی — Golden Perfumes
# ---------------------------------------------------------------------------

P(
    "oud-royal-100ml",
    brand="Golden",
    desc=(
        "عود رویال، عطری گرم و چوبی با پایه عود و کهربا که برای شب و مجلس ساخته شده. "
        "ماندگاری آن روی لباس تا یک روز کامل است و پخش بوی آن قوی اما نه سنگین است. "
        "در همین دکان تست کنید — بوی عود روی هر پوست کمی متفاوت می‌نشیند.",
        "Oud Royal is a warm, woody scent built on oud and amber, made for the evening "
        "and for gatherings. On clothing it holds a full day, and the projection is "
        "strong without being heavy. Try it here — oud settles a little differently on "
        "every skin.",
    ),
    attrs=[
        ("brand", "طلایی", "Golden"),
        ("volume", "۱۰۰ میلی‌لیتر", "100 ml"),
        ("concentration", "ادو پرفیوم", "Eau de parfum"),
        ("family", "چوبی و شرقی", "Woody oriental"),
        ("gender", "مردانه و زنانه", "Unisex"),
        ("origin", "امارات", "UAE"),
    ],
    features=[
        ("ماندگاری بلند", "Long wear", "روی لباس تا یک روز کامل می‌ماند.", "A full day on clothing."),
        ("پایه عود", "Oud base", "عود و کهربا، گرم و شرقی.", "Oud and amber — warm and oriental."),
        ("تست در دکان", "Try before you buy", "روی پوست خودتان امتحان کنید.", "Sample it on your own skin."),
    ],
)

P(
    "amber-musk-50ml",
    brand="Golden",
    desc=(
        "عنبر و مشک، ترکیبی نرم و پودری که برای روز و محیط کار مناسب است. "
        "برخلاف عودهای سنگین، این عطر فضا را پر نمی‌کند و کسی را اذیت نمی‌کند. "
        "شیشه ۵۰ میلی‌لیتری آن در کیف جا می‌شود.",
        "Amber and musk, a soft powdery blend that suits daytime and the office. "
        "Unlike the heavier ouds it does not fill a room or bother anyone nearby. The "
        "50 ml bottle fits in a bag.",
    ),
    attrs=[
        ("brand", "طلایی", "Golden"),
        ("volume", "۵۰ میلی‌لیتر", "50 ml"),
        ("concentration", "ادو تویلت", "Eau de toilette"),
        ("family", "عنبر و مشک", "Amber and musk"),
        ("gender", "مردانه و زنانه", "Unisex"),
        ("origin", "امارات", "UAE"),
    ],
    features=[
        ("مناسب روز", "For daytime", "ملایم و مناسب محیط کار.", "Soft enough for the office."),
        ("اندازه کیفی", "Bag size", "۵۰ میلی‌لیتر، قابل حمل.", "50 ml, easy to carry."),
        ("پخش ملایم", "Gentle projection", "فضا را پر نمی‌کند.", "It does not fill the room."),
    ],
)

P(
    "rose-taif-attar-12ml",
    brand="Golden",
    desc=(
        "عطر گل سرخ طایف، عطر روغنی بدون الکل در شیشه ۱۲ میلی‌لیتری با درپوش چوبی. "
        "چون روغنی است، یک قطره روی مچ دست ساعت‌ها بو می‌دهد. "
        "برای کسانی که پوست‌شان با عطرهای الکلی حساسیت پیدا می‌کند، انتخاب درست است.",
        "Taif rose attar, an alcohol-free oil perfume in a 12 ml bottle with a wooden "
        "cap. Because it is an oil, one drop on the wrist carries for hours. The right "
        "choice for anyone whose skin reacts to alcohol-based sprays.",
    ),
    attrs=[
        ("brand", "طلایی", "Golden"),
        ("volume", "۱۲ میلی‌لیتر", "12 ml"),
        ("concentration", "عطر روغنی، بدون الکل", "Oil attar, alcohol free"),
        ("family", "گلی — گل سرخ طایف", "Floral — Taif rose"),
        ("gender", "مردانه و زنانه", "Unisex"),
        ("origin", "عربستان", "Saudi Arabia"),
    ],
    features=[
        ("بدون الکل", "Alcohol free", "برای پوست حساس بی‌خطر است.", "Safe for skin that reacts to sprays."),
        ("یک قطره کافی است", "One drop is enough", "شیشه کوچک، مصرف بسیار کم.", "A small bottle that lasts."),
        ("درپوش چوبی", "Wooden cap", "شیشه دست‌ساز با اپلیکاتور شیشه‌ای.", "A hand-finished bottle with a glass wand."),
    ],
)

P(
    "bakhoor-incense-set",
    brand="Golden",
    desc=(
        "ست بخور با سوزاننده سفالی و سه بسته بخور معطر — همان بویی که خانه را برای مهمان آماده می‌کند. "
        "سوزاننده روی برق کار می‌کند، پس زغال و دود اضافی لازم نیست. "
        "برای هدیه هم مناسب است و در جعبه بسته‌بندی می‌شود.",
        "A bakhoor set with a ceramic burner and three packs of scented bakhoor — the "
        "smell that gets a house ready for guests. The burner runs on mains power, so "
        "there is no charcoal and no extra smoke. It gift-boxes well.",
    ),
    attrs=[
        ("brand", "طلایی", "Golden"),
        ("volume", "سوزاننده + ۳ بسته ۴۰ گرامی", "Burner + 3 × 40 g packs"),
        ("concentration", "بخور چوبی", "Wood bakhoor"),
        ("family", "عود و صندل", "Oud and sandalwood"),
        ("gender", "برای خانه", "For the home"),
        ("origin", "امارات", "UAE"),
    ],
    features=[
        ("سوزاننده برقی", "Electric burner", "بدون زغال و بدون دود اضافی.", "No charcoal and no extra smoke."),
        ("سه بوی متفاوت", "Three scents", "عود، صندل و گل.", "Oud, sandalwood and floral."),
        ("جعبه هدیه", "Gift boxed", "آماده برای هدیه دادن.", "Ready to give as it is."),
    ],
)

P(
    "citrus-fresh-men-100",
    brand="Golden",
    desc=(
        "سیتروس فرش، عطری خنک با نت‌های لیمو و برگاموت برای روزهای گرم. "
        "سبک و تازه است و برای صبح و محیط کار مناسب‌تر از عطرهای شیرین است. "
        "ماندگاری آن حدود شش ساعت روی پوست است.",
        "Citrus Fresh is a cool scent of lemon and bergamot for warm days. It is light "
        "and clean, and better suited to the morning and the office than the sweeter "
        "blends. On skin it holds around six hours.",
    ),
    attrs=[
        ("brand", "طلایی", "Golden"),
        ("volume", "۱۰۰ میلی‌لیتر", "100 ml"),
        ("concentration", "ادو تویلت", "Eau de toilette"),
        ("family", "مرکبات", "Citrus"),
        ("gender", "مردانه", "For men"),
        ("origin", "امارات", "UAE"),
    ],
    features=[
        ("خنک و تازه", "Cool and fresh", "برای تابستان و ساعات روز.", "For summer and daytime."),
        ("مناسب کار", "Office friendly", "سبک، بدون شیرینی سنگین.", "Light, with no heavy sweetness."),
        ("شش ساعت ماندگاری", "About six hours", "روی پوست، بیشتر روی لباس.", "On skin; longer on clothing."),
    ],
)

# ---------------------------------------------------------------------------
# ساعت نور — Noor Watches
# ---------------------------------------------------------------------------

P(
    "casio-edifice-steel",
    brand="Casio",
    model="Edifice EFV-100",
    desc=(
        "کاسیو ادیفایس با قاب و بند استیل ضد زنگ، ساعتی رسمی که برای هر روز هم دوام می‌آورد. "
        "کرونوگراف و تاریخ دارد و تا ۱۰۰ متر ضد آب است. "
        "باتری آن حدود سه سال کار می‌کند و تعویض آن در همین دکان انجام می‌شود.",
        "A Casio Edifice in a stainless steel case and bracelet — a formal watch that "
        "survives daily wear. It has a chronograph and a date, and is water resistant "
        "to 100 metres. The battery runs about three years and we change it here.",
    ),
    attrs=[
        ("brand", "کاسیو", "Casio"),
        ("model", "Edifice EFV-100", "Edifice EFV-100"),
        ("movement", "کوارتز", "Quartz"),
        ("caseMaterial", "استیل ضد زنگ، ۴۳ میلی‌متر", "Stainless steel, 43 mm"),
        ("strap", "بند استیل", "Steel bracelet"),
        ("waterResistance", "۱۰۰ متر", "100 m"),
        WARRANTY_SHOP_12,
    ],
    features=[
        ("کرونوگراف", "Chronograph", "سه شمارنده فعال، نه تزئینی.", "Three working counters, not decoration."),
        ("۱۰۰ متر ضد آب", "100 m water resistant", "شنا و وضو بدون نگرانی.", "Swimming and washing without worry."),
        ("تعویض باتری در دکان", "Battery changed here", "بعد از سه سال، در همین غرفه.", "After about three years, at this counter."),
    ],
)

P(
    "casio-classic-leather",
    brand="Casio",
    model="MTP-1183",
    desc=(
        "کاسیو کلاسیک با بند چرمی و صفحه ساده — ساعتی که با کت و با پیراهن ساده هر دو می‌خورد. "
        "سبک است و روی مچ سنگینی نمی‌کند، و تاریخ‌نما دارد. "
        "انتخاب خوبی برای هدیه فراغت یا اولین ساعت رسمی.",
        "A classic Casio on a leather strap with a plain dial — a watch that works with "
        "a jacket and with a shirt alike. It is light on the wrist and carries a date "
        "window. A good graduation gift, or a first formal watch.",
    ),
    attrs=[
        ("brand", "کاسیو", "Casio"),
        ("model", "MTP-1183", "MTP-1183"),
        ("movement", "کوارتز", "Quartz"),
        ("caseMaterial", "استیل، ۳۸ میلی‌متر", "Steel, 38 mm"),
        ("strap", "چرم طبیعی", "Genuine leather"),
        ("waterResistance", "۳۰ متر", "30 m"),
        WARRANTY_SHOP_12,
    ],
    features=[
        ("بند چرم طبیعی", "Real leather strap", "با گذشت وقت نرم‌تر می‌شود.", "It softens with wear."),
        ("صفحه ساده", "A plain dial", "بدون شلوغی، خوانا در یک نگاه.", "Uncluttered and readable at a glance."),
        ("مناسب هدیه", "Gift ready", "در جعبه اصلی تحویل می‌شود.", "Delivered in its own box."),
    ],
)

P(
    "seiko-automatic-5",
    brand="Seiko",
    model="Seiko 5 SNK",
    desc=(
        "سیکو ۵ اتوماتیک، ساعتی مکانیکی که با حرکت دست کوک می‌شود و باتری نمی‌خواهد. "
        "پشت آن شیشه‌ای است و مکانیزم را می‌بینید — همان چیزی که این ساعت را برای دوستداران ساعت خاص می‌کند. "
        "اگر چند روز آن را نپوشید، دوباره کوک دستی لازم دارد.",
        "A Seiko 5 automatic — a mechanical watch wound by the movement of your arm, "
        "with no battery at all. The exhibition caseback shows the movement working, "
        "which is what makes this watch special to collectors. Leave it off for a few "
        "days and it needs a hand wind to restart.",
    ),
    attrs=[
        ("brand", "سیکو", "Seiko"),
        ("model", "Seiko 5 SNK", "Seiko 5 SNK"),
        ("movement", "اتوماتیک، ۲۱ سنگ", "Automatic, 21 jewels"),
        ("caseMaterial", "استیل، ۳۷ میلی‌متر", "Steel, 37 mm"),
        ("strap", "بند استیل", "Steel bracelet"),
        ("waterResistance", "۳۰ متر", "30 m"),
        WARRANTY_SHOP_12,
    ],
    features=[
        ("بدون باتری", "No battery", "با حرکت دست کوک می‌شود.", "Wound by the movement of your arm."),
        ("پشت شیشه‌ای", "Exhibition caseback", "مکانیزم در حال کار دیده می‌شود.", "You can watch the movement working."),
        ("۴۰ ساعت ذخیره", "40-hour reserve", "یک شب و یک روز بدون پوشیدن.", "It keeps running overnight and through a day off."),
    ],
)

P(
    "womens-gold-tone-watch",
    brand="Noor",
    desc=(
        "ساعت زنانه با روکش طلایی و بند باریک، ظریف و سبک برای مچ باریک. "
        "صفحه کوچک و ساده است و بیشتر نقش زیورآلات دارد تا ابزار. "
        "برای مهمانی و مراسم انتخاب مناسبی است و در جعبه هدیه تحویل می‌شود.",
        "A women's watch in a gold-tone finish on a slim bracelet, delicate and light "
        "for a narrow wrist. The dial is small and plain — this is closer to jewellery "
        "than to a tool. It suits gatherings and ceremonies, and comes gift boxed.",
    ),
    attrs=[
        ("brand", "نور", "Noor"),
        ("movement", "کوارتز", "Quartz"),
        ("caseMaterial", "روکش طلایی، ۲۸ میلی‌متر", "Gold-tone plating, 28 mm"),
        ("strap", "بند فلزی باریک", "Slim metal bracelet"),
        ("waterResistance", "مقاوم در برابر پاشش", "Splash resistant"),
        WARRANTY_SHOP_6,
    ],
    features=[
        ("قاب ظریف", "A delicate case", "۲۸ میلی‌متر، مناسب مچ باریک.", "28 mm, sized for a narrow wrist."),
        ("جعبه هدیه", "Gift boxed", "آماده برای هدیه.", "Ready to give."),
        ("تنظیم بند رایگان", "Free sizing", "بند را همین‌جا اندازه می‌کنیم.", "We size the bracelet at the counter."),
    ],
)

P(
    "digital-sport-watch",
    brand="Noor",
    desc=(
        "ساعت دیجیتال ورزشی با کرنومتر، آلارم و چراغ صفحه، ساخته‌شده برای استفاده روزمره و ورزش. "
        "بند سیلیکونی آن با عرق خراب نمی‌شود و تا ۵۰ متر ضد آب است. "
        "قیمت آن پایین است و برای متعلم و ورزشکار انتخاب عملی است.",
        "A digital sports watch with a stopwatch, alarm and backlight, built for daily "
        "wear and training. The silicone strap survives sweat and it is water "
        "resistant to 50 metres. The price makes it a practical choice for a student "
        "or an athlete.",
    ),
    attrs=[
        ("brand", "نور", "Noor"),
        ("movement", "دیجیتال کوارتز", "Digital quartz"),
        ("caseMaterial", "رزین، ۴۲ میلی‌متر", "Resin, 42 mm"),
        ("strap", "سیلیکون", "Silicone"),
        ("waterResistance", "۵۰ متر", "50 m"),
        WARRANTY_SHOP_6,
    ],
    features=[
        ("کرنومتر و آلارم", "Stopwatch and alarm", "برای تمرین و وقت‌سنجی.", "For training and timing."),
        ("چراغ صفحه", "Backlight", "خوانا در شب.", "Readable at night."),
        ("بند سیلیکونی", "Silicone strap", "با عرق خراب نمی‌شود.", "Sweat does not ruin it."),
    ],
)

# ---------------------------------------------------------------------------
# پوشاک آریانا — Ariana Clothing
# ---------------------------------------------------------------------------

P(
    "mens-perahan-tunban-cotton",
    brand="Ariana",
    desc=(
        "پیراهن تنبان مردانه از تکه نخی صد در صد، دوخت‌شده در همین کابل. "
        "پارچه نخی در گرمای تابستان نفس می‌کشد و بعد از چند بار شستن نرم‌تر می‌شود. "
        "سایزها از مدیم تا دبل ایکس‌ال موجود است و تنگ‌کردن آن در دکان رایگان انجام می‌شود.",
        "A men's perahan tunban in 100% cotton, cut and sewn here in Kabul. Cotton "
        "breathes through the summer heat and softens after a few washes. Sizes run "
        "from medium to XXL, and we take it in at the shop free of charge.",
    ),
    attrs=[
        ("brand", "آریانا", "Ariana"),
        ("material", "۱۰۰٪ نخ", "100% cotton"),
        ("sizes", "M، L، XL، XXL", "M, L, XL, XXL"),
        ("colour", "سفید، کریمی، خاکستری", "White, cream, grey"),
        ("gender", "مردانه", "Men"),
        ("care", "شستشوی ماشینی با آب سرد", "Machine wash cold"),
    ],
    features=[
        ("نخ خالص", "Pure cotton", "در گرما نفس می‌کشد.", "It breathes in the heat."),
        ("دوخت کابل", "Sewn in Kabul", "خیاطی محلی، نه واردات انبوه.", "Local tailoring, not bulk import."),
        ("تنگ‌کردن رایگان", "Free alterations", "اندازه را همین‌جا درست می‌کنیم.", "We fit it at the shop."),
    ],
)

P(
    "mens-wool-blazer",
    brand="Ariana",
    desc=(
        "کت مردانه از پشم مخلوط، با آستر کامل و دو دکمه — مناسب دفتر، مراسم و نکاح. "
        "پشم مخلوط چروک کمتری می‌گیرد و در زمستان کابل به‌اندازه گرم است. "
        "اندازه‌کردن شانه و آستین در دکان انجام می‌شود.",
        "A men's blazer in a wool blend, fully lined with two buttons — for the office, "
        "for ceremonies and for a nikah. The blend creases less than pure wool and is "
        "warm enough for a Kabul winter. Shoulders and sleeves are fitted in store.",
    ),
    attrs=[
        ("brand", "آریانا", "Ariana"),
        ("material", "۷۰٪ پشم، ۳۰٪ پلی‌استر", "70% wool, 30% polyester"),
        ("sizes", "۴۸ تا ۵۶", "48 to 56"),
        ("colour", "سرمه‌ای، خاکستری، مشکی", "Navy, grey, black"),
        ("gender", "مردانه", "Men"),
        ("care", "خشک‌شویی", "Dry clean"),
    ],
    features=[
        ("آستر کامل", "Fully lined", "روی پیراهن روان می‌نشیند.", "It sits smoothly over a shirt."),
        ("پشم مخلوط", "Wool blend", "گرم، با چروک کمتر.", "Warm, and it creases less."),
        ("اندازه‌کردن در دکان", "Fitted in store", "شانه و آستین، رایگان.", "Shoulders and sleeves, at no charge."),
    ],
)

P(
    "womens-embroidered-dress",
    brand="Ariana",
    desc=(
        "پیراهن زنانه با گلدوزی دستی روی سینه و آستین، کاری که برای هر پیراهن چند روز وقت می‌برد. "
        "پارچه آن مخلوط نخ و ویسکوز است؛ سنگین نیست و خوب می‌ایستد. "
        "برای مراسم و مهمانی دوخته شده و رنگ‌های موجود در دکان قابل دیدن است.",
        "A women's dress with hand embroidery across the bodice and sleeves — work that "
        "takes a few days for each piece. The cloth is a cotton and viscose blend: not "
        "heavy, and it holds its shape. Made for ceremonies and gatherings; the shades "
        "in stock are on the rail in the shop.",
    ),
    attrs=[
        ("brand", "آریانا", "Ariana"),
        ("material", "نخ و ویسکوز، گلدوزی دستی", "Cotton and viscose, hand embroidered"),
        ("sizes", "S، M، L، XL", "S, M, L, XL"),
        ("colour", "سرخ، سبز، سرمه‌ای", "Red, green, navy"),
        ("gender", "زنانه", "Women"),
        ("care", "شستشوی دستی", "Hand wash"),
    ],
    features=[
        ("گلدوزی دستی", "Hand embroidery", "چند روز کار برای هر پیراهن.", "Days of work in every piece."),
        ("پارچه سبک", "A light cloth", "برای مجلس‌های طولانی راحت است.", "Comfortable through a long evening."),
        ("اندازه‌کردن رایگان", "Free alterations", "قد و آستین را درست می‌کنیم.", "We adjust length and sleeves."),
    ],
)

P(
    "womens-wool-shawl",
    brand="Ariana",
    desc=(
        "شال پشمی زنانه با بافت نرم و ریشه‌های دست‌باف، به اندازه‌ای که هم روی سر و هم روی شانه بنشیند. "
        "پشم گرم است اما خارش ندارد، چون با نخ نرم مخلوط شده. "
        "در زمستان کابل یک شال خوب جای یک کت را می‌گیرد.",
        "A women's wool shawl with a soft weave and hand-knotted fringe, cut large "
        "enough to sit over the head or across the shoulders. The wool is warm without "
        "itching, because it is blended with a softer yarn. In a Kabul winter a good "
        "shawl does the work of a coat.",
    ),
    attrs=[
        ("brand", "آریانا", "Ariana"),
        ("material", "۶۰٪ پشم، ۴۰٪ اکریلیک", "60% wool, 40% acrylic"),
        ("sizes", "۲۰۰ × ۷۰ سانتی‌متر", "200 × 70 cm"),
        ("colour", "کریمی، خاکستری، زرشکی", "Cream, grey, maroon"),
        ("gender", "زنانه", "Women"),
        ("care", "شستشوی دستی با آب سرد", "Hand wash cold"),
    ],
    features=[
        ("بدون خارش", "No itch", "پشم مخلوط با نخ نرم.", "Wool blended with a softer yarn."),
        ("اندازه بزرگ", "Generous size", "۲۰۰ سانتی‌متر — روی سر و شانه.", "200 cm — over the head or the shoulders."),
        ("ریشه دست‌باف", "Hand-knotted fringe", "کار دست، نه دوخت ماشینی.", "Handwork, not a machine hem."),
    ],
)

P(
    "mens-cotton-shirt-formal",
    brand="Ariana",
    desc=(
        "پیراهن رسمی مردانه از نخ ضد چروک، مناسب دفتر و جلسه. "
        "یقه آن سفت است و بعد از شستن هم فرم خود را نگه می‌دارد. "
        "سایزهای یقه ۳۹ تا ۴۵ موجود است.",
        "A men's formal shirt in wrinkle-resistant cotton, made for the office and for "
        "meetings. The collar is stiffened and keeps its shape after washing. Collar "
        "sizes run 39 to 45.",
    ),
    attrs=[
        ("brand", "آریانا", "Ariana"),
        ("material", "۹۵٪ نخ، ۵٪ الاستان", "95% cotton, 5% elastane"),
        ("sizes", "یقه ۳۹ تا ۴۵", "Collar 39 to 45"),
        ("colour", "سفید، آبی روشن، خاکستری", "White, light blue, grey"),
        ("gender", "مردانه", "Men"),
        ("care", "شستشوی ماشینی، اتو با حرارت متوسط", "Machine wash, warm iron"),
    ],
    features=[
        ("ضد چروک", "Wrinkle resistant", "بعد از شستن اتوی کمتری می‌خواهد.", "Less ironing after a wash."),
        ("یقه فرم‌دار", "Structured collar", "زیر کروات صاف می‌ایستد.", "It stands up under a tie."),
        ("کمی کشسان", "A little stretch", "برای نشستن طولانی راحت‌تر.", "Easier through a long day at a desk."),
    ],
)

P(
    "womens-winter-coat",
    brand="Ariana",
    desc=(
        "کت زمستانی زنانه با آستر کرکی و کلاه قابل جداشدن، برای سردترین روزهای کابل. "
        "پارچه بیرونی ضد باد است و برف را نگه نمی‌دارد. "
        "جیب‌های داخلی و بیرونی دارد و تا زیر زانو می‌رسد.",
        "A women's winter coat with a fleece lining and a detachable hood, for Kabul's "
        "coldest days. The outer shell is windproof and sheds snow. It has inside and "
        "outside pockets and falls below the knee.",
    ),
    attrs=[
        ("brand", "آریانا", "Ariana"),
        ("material", "پلی‌استر ضد باد با آستر کرکی", "Windproof polyester, fleece lined"),
        ("sizes", "S، M، L، XL", "S, M, L, XL"),
        ("colour", "مشکی، زیتونی، شرابی", "Black, olive, wine"),
        ("gender", "زنانه", "Women"),
        ("care", "شستشوی ماشینی با آب سرد", "Machine wash cold"),
    ],
    features=[
        ("آستر کرکی", "Fleece lined", "برای سردترین روزهای زمستان.", "For the coldest days of the season."),
        ("کلاه جداشدنی", "Detachable hood", "در بهار بدون کلاه پوشیده می‌شود.", "Wear it without the hood in spring."),
        ("ضد باد", "Windproof", "باد سرد را رد نمی‌کند.", "The wind does not get through."),
    ],
)

# ---------------------------------------------------------------------------
# کفش پامیر — Pamir Shoes
# ---------------------------------------------------------------------------

P(
    "mens-leather-oxford",
    brand="Pamir",
    desc=(
        "کفش رسمی مردانه از چرم طبیعی گاوی با دوخت گودیر، همان دوختی که کفش را قابل تعمیر می‌کند. "
        "کف چرمی و پاشنه لاستیکی دارد، پس روی سنگفرش نمی‌لغزد. "
        "برای دفتر و مراسم، و با نگهداری درست چند سال دوام می‌آورد.",
        "A men's formal shoe in genuine cowhide with a Goodyear welt — the construction "
        "that makes a shoe repairable rather than disposable. A leather sole with a "
        "rubber heel keeps its grip on paving. For the office and for ceremonies, and "
        "with care it lasts years.",
    ),
    attrs=[
        ("brand", "پامیر", "Pamir"),
        ("material", "چرم طبیعی گاوی", "Genuine cowhide"),
        ("sole", "چرم با پاشنه لاستیکی", "Leather with a rubber heel"),
        ("sizes", "۴۰ تا ۴۵", "40 to 45"),
        ("colour", "مشکی، قهوه‌ای", "Black, brown"),
        ("gender", "مردانه", "Men"),
        ("care", "واکس چرم هر چند هفته", "Polish every few weeks"),
    ],
    features=[
        ("دوخت گودیر", "Goodyear welt", "کف قابل تعویض است، کفش دور انداختنی نیست.", "The sole can be replaced instead of the shoe."),
        ("چرم طبیعی", "Real leather", "با پا فرم می‌گیرد.", "It takes the shape of your foot."),
        ("پاشنه لاستیکی", "Rubber heel", "روی سنگفرش نمی‌لغزد.", "Grip on paving and tile."),
    ],
)

P(
    "nike-air-running",
    brand="Nike",
    model="Air Zoom",
    desc=(
        "کتانی دویدن نایک با کف بادی و رویه توری، سبک و مناسب دویدن روزانه. "
        "توری بودن رویه یعنی پا در تابستان عرق کمتری می‌کند. "
        "برای دویدن، جیم و پیاده‌روی طولانی مناسب است.",
        "A Nike running shoe with an air-cushioned sole and a mesh upper — light, and "
        "made for regular running. The mesh means less sweat in summer. Good for "
        "running, the gym and long walks.",
    ),
    attrs=[
        ("brand", "نایک", "Nike"),
        ("material", "رویه توری با روکش مصنوعی", "Mesh upper with synthetic overlays"),
        ("sole", "فوم با کف بادی", "Foam with air cushioning"),
        ("sizes", "۴۰ تا ۴۵", "40 to 45"),
        ("colour", "مشکی/سفید، خاکستری", "Black/white, grey"),
        ("gender", "مردانه", "Men"),
        ("care", "شستشوی دستی، دور از آفتاب خشک شود", "Hand wash, dry out of the sun"),
    ],
    features=[
        ("کف بادی", "Air cushioning", "ضربه دویدن روی سرک را کم می‌کند.", "Takes the impact out of road running."),
        ("رویه توری", "Mesh upper", "پا در تابستان خنک می‌ماند.", "The foot stays cooler in summer."),
        ("سبک", "Light", "کمتر از ۳۰۰ گرام در سایز ۴۲.", "Under 300 grams in size 42."),
    ],
)

P(
    "school-shoes-black",
    brand="Pamir",
    desc=(
        "کفش مکتب مشکی با رویه چرم مصنوعی و کف لاستیکی دوخته‌شده، ساخته‌شده برای یک سال کامل مکتب. "
        "بند چسبی دارد تا اطفال کوچک خودشان بپوشند. "
        "قیمت آن پایین نگه داشته شده چون هر سال باید عوض شود.",
        "A black school shoe with a synthetic leather upper and a stitched rubber sole, "
        "built to survive a full school year. The hook-and-loop strap means small "
        "children can put them on themselves. We keep the price low because these get "
        "replaced every year.",
    ),
    attrs=[
        ("brand", "پامیر", "Pamir"),
        ("material", "چرم مصنوعی", "Synthetic leather"),
        ("sole", "لاستیک دوخته‌شده", "Stitched rubber"),
        ("sizes", "۳۰ تا ۳۸", "30 to 38"),
        ("colour", "مشکی", "Black"),
        ("gender", "اطفال", "Children"),
        ("care", "پاک کردن با تکه نمدار", "Wipe with a damp cloth"),
    ],
    features=[
        ("کف دوخته‌شده", "Stitched sole", "با چسب نیست، پس جدا نمی‌شود.", "Not glued, so it does not come apart."),
        ("بند چسبی", "Hook-and-loop strap", "اطفال خودشان می‌پوشند.", "Children manage them alone."),
        ("قیمت مکتب", "School price", "هر سال قابل تعویض، بدون فشار.", "Replaceable each year without pain."),
    ],
)

P(
    "womens-flat-sandals",
    brand="Pamir",
    desc=(
        "صندل تخت زنانه با کف نرم و بند قابل تنظیم، برای پوشیدن روزانه در گرما. "
        "کف آن ضد لغزش است و روی کاشی و سنگ خیس هم می‌گیرد. "
        "سبک است و در کیف جا می‌شود.",
        "Women's flat sandals with a soft footbed and an adjustable strap, for everyday "
        "wear in the heat. The sole grips on tile and wet stone. They are light and "
        "fold into a bag.",
    ),
    attrs=[
        ("brand", "پامیر", "Pamir"),
        ("material", "چرم مصنوعی نرم", "Soft synthetic leather"),
        ("sole", "لاستیک ضد لغزش", "Non-slip rubber"),
        ("sizes", "۳۶ تا ۴۱", "36 to 41"),
        ("colour", "مشکی، قهوه‌ای، کریمی", "Black, brown, cream"),
        ("gender", "زنانه", "Women"),
        ("care", "پاک کردن با تکه نمدار", "Wipe with a damp cloth"),
    ],
    features=[
        ("بند قابل تنظیم", "Adjustable strap", "برای پای پهن و باریک هر دو.", "Fits a wide foot and a narrow one."),
        ("ضد لغزش", "Non-slip", "روی کاشی خیس هم می‌گیرد.", "Grips on wet tile."),
        ("سبک", "Light", "در کیف جا می‌شود.", "They fit in a bag."),
    ],
)

P(
    "winter-boots-lined",
    brand="Pamir",
    desc=(
        "بوت زمستانی با آستر خزدار و کف عاج‌دار، برای برف و یخبندان کابل. "
        "رویه ضد آب است و تا مچ را می‌پوشاند، پس برف داخل نمی‌شود. "
        "کف عمیق آن روی یخ و برف کوبیده‌شده می‌گیرد.",
        "A lined winter boot with a fur lining and a deep-lugged sole, for Kabul snow "
        "and ice. The upper is water resistant and covers the ankle, so snow stays "
        "out. The deep tread holds on ice and packed snow.",
    ),
    attrs=[
        ("brand", "پامیر", "Pamir"),
        ("material", "چرم مصنوعی ضد آب با آستر خزدار", "Water-resistant synthetic, fur lined"),
        ("sole", "لاستیک عاج‌دار", "Deep-lugged rubber"),
        ("sizes", "۳۹ تا ۴۵", "39 to 45"),
        ("colour", "مشکی، قهوه‌ای", "Black, brown"),
        ("gender", "مردانه و زنانه", "Men and women"),
        ("care", "خشک کردن دور از بخاری", "Dry away from a heater"),
    ],
    features=[
        ("آستر خزدار", "Fur lined", "برای زیر صفر ساخته شده.", "Made for below zero."),
        ("کف عاج‌دار", "Deep tread", "روی یخ و برف کوبیده می‌گیرد.", "Grip on ice and packed snow."),
        ("ضد آب", "Water resistant", "برف را رد نمی‌کند.", "Snow does not get through."),
    ],
)

# ---------------------------------------------------------------------------
# لوازم خانه سلام — Salam Home Appliances
# ---------------------------------------------------------------------------

P(
    "moulinex-blender",
    brand="Moulinex",
    model="LM242",
    desc=(
        "بلندر مولینکس با موتور ۶۰۰ واتی و کاسه شیشه‌ای ۱.۵ لیتری. "
        "شیشه بر خلاف پلاستیک بو نمی‌گیرد و رنگ زردچوبه روی آن نمی‌ماند. "
        "تیغه استیل آن یخ را هم خرد می‌کند و دو سرعت به‌علاوه دکمه پالس دارد.",
        "A Moulinex blender with a 600-watt motor and a 1.5-litre glass jar. Glass, "
        "unlike plastic, does not hold smells or stain from turmeric. The steel blade "
        "crushes ice, and there are two speeds plus a pulse button.",
    ),
    attrs=[
        ("brand", "مولینکس", "Moulinex"),
        ("capacity", "۱.۵ لیتر", "1.5 L"),
        ("power", "۶۰۰ وات", "600 W"),
        ("material", "کاسه شیشه‌ای، تیغه استیل", "Glass jar, steel blade"),
        ("contents", "بلندر، کاسه، درپوش اندازه‌گیری", "Blender, jar, measuring cap"),
        WARRANTY_SHOP_12,
    ],
    features=[
        ("کاسه شیشه‌ای", "Glass jar", "بو نمی‌گیرد و لکه‌دار نمی‌شود.", "It does not hold smells or stain."),
        ("خردکن یخ", "Crushes ice", "تیغه استیل، دکمه پالس.", "A steel blade and a pulse button."),
        ("قابل شستشو", "Dishwasher safe", "کاسه و تیغه جدا می‌شوند.", "The jar and blade come apart."),
    ],
)

P(
    "pressure-cooker-7l",
    brand="Salam",
    desc=(
        "دیگ بخار ۷ لیتری آلومینیمی با سه سیستم ایمنی، اندازه‌ای که برای یک فامیل بزرگ کافی است. "
        "گوشت و لوبیا را در یک‌سوم وقت معمولی می‌پزد و گاز کمتری مصرف می‌کند. "
        "درپوش آن قفل ایمنی دارد و تا فشار داخل خالی نشود باز نمی‌شود.",
        "A 7-litre aluminium pressure cooker with three safety systems, sized for a "
        "large family. Meat and beans cook in a third of the usual time and use less "
        "gas. The lid locks and will not open until the pressure inside has dropped.",
    ),
    attrs=[
        ("brand", "سلام", "Salam"),
        ("capacity", "۷ لیتر", "7 L"),
        ("power", "گاز و برق", "Gas and electric hobs"),
        ("material", "آلومینیم ضخیم", "Heavy-gauge aluminium"),
        ("contents", "دیگ، درپوش، واشر یدکی", "Cooker, lid, spare gasket"),
        WARRANTY_SHOP_12,
    ],
    features=[
        ("سه سیستم ایمنی", "Three safety systems", "قفل درپوش، سوپاپ و واشر اطمینان.", "Lid lock, release valve and safety gasket."),
        ("صرفه‌جویی در گاز", "Less gas", "یک‌سوم وقت پخت معمولی.", "A third of the usual cooking time."),
        ("واشر یدکی", "Spare gasket", "یک واشر اضافی در جعبه است.", "A spare comes in the box."),
    ],
)

P(
    "electric-kettle-1-7",
    brand="Salam",
    desc=(
        "کتری برقی ۱.۷ لیتری با بدنه استیل و خاموشی خودکار. "
        "آب را در حدود چهار دقیقه به جوش می‌آورد و بعد از جوش خودش خاموش می‌شود. "
        "برای دفتر، صنف و خانه‌ای که چای زیاد دم می‌کند مناسب است.",
        "A 1.7-litre electric kettle with a steel body and automatic shut-off. It "
        "boils in about four minutes and switches itself off. Suited to an office, a "
        "classroom, or a household that makes a lot of tea.",
    ),
    attrs=[
        ("brand", "سلام", "Salam"),
        ("capacity", "۱.۷ لیتر", "1.7 L"),
        ("power", "۲۰۰۰ وات", "2000 W"),
        ("material", "استیل ضد زنگ", "Stainless steel"),
        ("contents", "کتری و پایه برقی", "Kettle and power base"),
        WARRANTY_SHOP_12,
    ],
    features=[
        ("خاموشی خودکار", "Automatic shut-off", "بعد از جوش خودش خاموش می‌شود.", "It switches off after the boil."),
        ("چهار دقیقه", "Four minutes", "۲۰۰۰ وات برای جوش سریع.", "2000 W for a fast boil."),
        ("محافظ خشک‌کاری", "Boil-dry protection", "بدون آب روشن نمی‌ماند.", "It will not run empty."),
    ],
)

P(
    "tea-set-porcelain-12",
    brand="Salam",
    desc=(
        "ست چای‌خوری چینی ۱۲ پارچه — شش پیاله و شش نلبکی، با لبه طلایی. "
        "چینی نازک است اما محکم، و در ماشین ظرف‌شویی هم می‌شود شست. "
        "برای مهمانی و برای هدیه عروسی مناسب است و در جعبه بسته‌بندی می‌شود.",
        "A 12-piece porcelain tea set — six cups and six saucers, with a gold rim. The "
        "porcelain is fine but sturdy, and it is dishwasher safe. Right for guests and "
        "as a wedding gift; it comes boxed.",
    ),
    attrs=[
        ("brand", "سلام", "Salam"),
        ("capacity", "۱۲ پارچه — ۶ پیاله، ۶ نلبکی", "12 pieces — 6 cups, 6 saucers"),
        ("material", "چینی با لبه طلایی", "Porcelain with a gold rim"),
        ("contents", "جعبه هدیه", "Gift box"),
        ("care", "قابل شستشو در ماشین ظرف‌شویی", "Dishwasher safe"),
    ],
    features=[
        ("لبه طلایی", "Gold rim", "کار دست، روی هر پارچه.", "Applied by hand on every piece."),
        ("قابل شستشو در ماشین", "Dishwasher safe", "چینی محکم، نه تزئینی صرف.", "Sturdy porcelain, not for display only."),
        ("جعبه هدیه", "Gift boxed", "آماده برای عروسی و مهمانی.", "Ready for a wedding or a gathering."),
    ],
)

P(
    "non-stick-pan-28",
    brand="Salam",
    desc=(
        "تابه ۲۸ سانتی‌متری با روکش نچسب دو لایه و کف ضخیم که حرارت را یکنواخت پخش می‌کند. "
        "با روغن کم هم غذا نمی‌چسبد و شستن آن ساده است. "
        "دسته آن ضد حرارت است و روی گاز و برق هر دو کار می‌کند.",
        "A 28 cm pan with a two-layer non-stick coating and a thick base that spreads "
        "heat evenly. Food will not stick even with little oil, and it washes easily. "
        "The handle stays cool and it works on gas and electric hobs.",
    ),
    attrs=[
        ("brand", "سلام", "Salam"),
        ("capacity", "قطر ۲۸ سانتی‌متر", "28 cm diameter"),
        ("power", "گاز و برق", "Gas and electric"),
        ("material", "آلومینیم با روکش نچسب", "Aluminium, non-stick coated"),
        ("contents", "تابه با دسته ضد حرارت", "Pan with a heat-resistant handle"),
    ],
    features=[
        ("نچسب دو لایه", "Two-layer non-stick", "با روغن کم هم نمی‌چسبد.", "Nothing sticks, even with little oil."),
        ("کف ضخیم", "Thick base", "حرارت یکنواخت، بدون سوختن نقطه‌ای.", "Even heat with no hot spots."),
        ("دسته ضد حرارت", "Cool handle", "بدون دستکش هم برداشته می‌شود.", "You can lift it without a cloth."),
    ],
)

P(
    "thermos-flask-2l",
    brand="Salam",
    desc=(
        "ترموس ۲ لیتری با جدار استیل دوجداره که چای را تا ۱۲ ساعت گرم نگه می‌دارد. "
        "برای سفر، دفتر و مهمانی‌های طولانی که چای باید همیشه آماده باشد. "
        "درپوش آن پمپی است، پس با یک دست هم می‌شود ریخت.",
        "A 2-litre flask with a double-walled steel body that keeps tea hot for up to "
        "12 hours. For travel, the office, and long gatherings where tea has to stay "
        "ready. The pump top pours one-handed.",
    ),
    attrs=[
        ("brand", "سلام", "Salam"),
        ("capacity", "۲ لیتر", "2 L"),
        ("material", "استیل دوجداره", "Double-walled steel"),
        ("contents", "ترموس با درپوش پمپی", "Flask with a pump top"),
        WARRANTY_SHOP_12,
    ],
    features=[
        ("۱۲ ساعت گرم", "Hot for 12 hours", "جدار دوجداره خلأ.", "A vacuum-insulated wall."),
        ("درپوش پمپی", "Pump top", "با یک دست ریخته می‌شود.", "Pours with one hand."),
        ("استیل ضد زنگ", "Stainless steel", "بو نمی‌گیرد و نمی‌شکند.", "It does not hold smells or shatter."),
    ],
)

# ---------------------------------------------------------------------------
# اسباب‌بازی کودک — Kudak Toys
# ---------------------------------------------------------------------------

P(
    "lego-classic-bricks",
    brand="Classic",
    desc=(
        "جعبه ۳۰۰ قطعه‌ای بلوک‌های ساختنی در رنگ‌های مختلف، با کتابچه چند طرح ساده. "
        "قطعات با برندهای معروف سازگارند، پس با بلوک‌های قبلی طفل ترکیب می‌شود. "
        "پلاستیک آن بدون BPA است و لبه‌های تیز ندارد.",
        "A 300-piece box of building bricks in assorted colours, with a booklet of a "
        "few simple builds. The pieces fit the well-known brands, so they mix with "
        "bricks a child already has. The plastic is BPA-free with no sharp edges.",
    ),
    attrs=[
        ("brand", "کلاسیک", "Classic"),
        ("ageRange", "۴ سال به بالا", "4 years and up"),
        ("material", "پلاستیک ABS بدون BPA", "BPA-free ABS plastic"),
        ("contents", "۳۰۰ قطعه و کتابچه طرح", "300 pieces and a build booklet"),
        ("safety", "بدون لبه تیز — نه برای زیر ۳ سال", "No sharp edges — not for under 3s"),
    ],
    features=[
        ("سازگار با برندهای معروف", "Fits the big brands", "با بلوک‌های قبلی ترکیب می‌شود.", "Mixes with bricks you already own."),
        ("۳۰۰ قطعه", "300 pieces", "برای چند طرح هم‌زمان کافی است.", "Enough for several builds at once."),
        ("جعبه نگهداری", "Storage box", "جعبه محکم برای جمع کردن.", "A sturdy box to put them away in."),
    ],
)

P(
    "remote-control-car",
    brand="Kudak",
    desc=(
        "موتر کنترلی با برد ۳۰ متر و باتری قابل شارژ، سرعت خوبی روی سنگفرش و قالین دارد. "
        "لاستیک‌های آن لاستیکی است نه پلاستیکی، پس روی سرامیک نمی‌لغزد. "
        "باتری و شارژر داخل جعبه است.",
        "A remote-control car with a 30-metre range and a rechargeable battery, quick "
        "enough on paving and on carpet. The tyres are rubber rather than plastic, so "
        "it does not slide on tiles. Battery and charger are in the box.",
    ),
    attrs=[
        ("brand", "کودک", "Kudak"),
        ("ageRange", "۶ سال به بالا", "6 years and up"),
        ("material", "پلاستیک با لاستیک طبیعی", "Plastic with rubber tyres"),
        ("contents", "موتر، کنترل، باتری، شارژر", "Car, controller, battery, charger"),
        ("safety", "مناسب بالای ۶ سال", "Suited to ages 6 and over"),
    ],
    features=[
        ("برد ۳۰ متر", "30-metre range", "در حویلی و پارک هم کار می‌کند.", "Works across a yard or a park."),
        ("باتری قابل شارژ", "Rechargeable", "شارژر در جعبه است.", "The charger is in the box."),
        ("لاستیک واقعی", "Rubber tyres", "روی سرامیک نمی‌لغزد.", "It grips on tiled floors."),
    ],
)

P(
    "wooden-puzzle-alphabet",
    brand="Kudak",
    desc=(
        "پزل چوبی الفبای دری با حروف رنگی و دستگیره‌های کوچک برای انگشتان کودک. "
        "چوب آن صیقلی و رنگ آن بدون سرب است، پس گاز گرفتن هم خطری ندارد. "
        "برای آماده‌کردن اطفال پیش از مکتب ساخته شده است.",
        "A wooden Dari alphabet puzzle with coloured letters and small pegs sized for "
        "a child's fingers. The wood is sanded smooth and the paint is lead-free, so "
        "chewing it does no harm. Made to get children ready before school.",
    ),
    attrs=[
        ("brand", "کودک", "Kudak"),
        ("ageRange", "۳ تا ۶ سال", "3 to 6 years"),
        ("material", "چوب صیقلی با رنگ بدون سرب", "Sanded wood, lead-free paint"),
        ("contents", "تخته و ۳۲ حرف", "Board and 32 letters"),
        ("safety", "رنگ بدون سرب، بدون لبه تیز", "Lead-free paint, no sharp edges"),
    ],
    features=[
        ("الفبای دری", "The Dari alphabet", "۳۲ حرف با تصویر.", "All 32 letters, each with a picture."),
        ("دستگیره کوچک", "Peg handles", "برای انگشتان کوچک ساخته شده.", "Sized for small fingers."),
        ("رنگ بی‌خطر", "Safe paint", "بدون سرب، قابل شستشو.", "Lead-free and washable."),
    ],
)

P(
    "doll-with-clothes",
    brand="Kudak",
    desc=(
        "عروسک ۳۰ سانتی‌متری با سه دست لباس قابل تعویض و موهای قابل شانه کردن. "
        "بدنه آن نرم و قابل شستشو است و لباس‌ها دکمه و چسب دارند تا کودک خودش عوض کند. "
        "در جعبه با یک شانه کوچک عرضه می‌شود.",
        "A 30 cm doll with three changes of clothes and hair that can be brushed. The "
        "body is soft and washable, and the outfits fasten with buttons and hook-and-"
        "loop so a child can change them alone. It comes boxed with a small brush.",
    ),
    attrs=[
        ("brand", "کودک", "Kudak"),
        ("ageRange", "۳ سال به بالا", "3 years and up"),
        ("material", "پارچه نرم با موی مصنوعی", "Soft fabric with synthetic hair"),
        ("contents", "عروسک، ۳ دست لباس، شانه", "Doll, 3 outfits, brush"),
        ("safety", "قابل شستشو، بدون قطعه کوچک", "Washable, no small parts"),
    ],
    features=[
        ("سه دست لباس", "Three outfits", "کودک خودش عوض می‌کند.", "A child can change them alone."),
        ("قابل شستشو", "Washable", "بدنه پارچه‌ای، شستنی.", "The fabric body washes clean."),
        ("موی قابل شانه", "Brushable hair", "با شانه‌ای که در جعبه است.", "With the brush in the box."),
    ],
)

P(
    "football-size-5",
    brand="Kudak",
    desc=(
        "توپ فوتبال سایز ۵ با رویه دوخته‌شده — نه چسبی — که روی زمین خاکی هم دوام می‌آورد. "
        "سایز ۵ اندازه رسمی بزرگسالان است و برای مکتب و زمین‌های محله مناسب است. "
        "پمپ کوچک همراه آن است.",
        "A size 5 football with a stitched cover — not glued — which survives a dirt "
        "pitch. Size 5 is the full adult size, right for school and neighbourhood "
        "grounds. A small pump comes with it.",
    ),
    attrs=[
        ("brand", "کودک", "Kudak"),
        ("ageRange", "۱۰ سال به بالا", "10 years and up"),
        ("material", "PVC دوخته‌شده با مثانه لاستیکی", "Stitched PVC with a rubber bladder"),
        ("contents", "توپ و پمپ کوچک", "Ball and a small pump"),
        ("safety", "بدون لبه تیز", "No sharp edges"),
    ],
    features=[
        ("رویه دوخته‌شده", "Stitched cover", "روی زمین خاکی باز نمی‌شود.", "It does not split on a dirt pitch."),
        ("سایز رسمی", "Full size", "سایز ۵، اندازه بزرگسالان.", "Size 5, the adult standard."),
        ("پمپ همراه", "Pump included", "بدون خرید جداگانه.", "No separate purchase needed."),
    ],
)

# ---------------------------------------------------------------------------
# قرطاسیه دانش — Danesh Stationery
# ---------------------------------------------------------------------------

P(
    "notebook-a4-200",
    brand="Danesh",
    desc=(
        "کتابچه A4 با ۲۰۰ ورق کاغذ ۷۰ گرامی و صحافی فنری که صفحه را کامل باز نگه می‌دارد. "
        "کاغذ ۷۰ گرامی یعنی خودکار از پشت صفحه رد نمی‌شود. "
        "جلد آن مقوایی و محکم است و در کیف تا نمی‌شود.",
        "An A4 notebook with 200 sheets of 70 gsm paper and a spiral binding that lets "
        "it lie flat. At 70 gsm ink does not show through the page. The cover is stiff "
        "card and will not fold in a bag.",
    ),
    attrs=[
        ("brand", "دانش", "Danesh"),
        ("size", "A4 — ۲۱ × ۲۹.۷ سانتی‌متر", "A4 — 21 × 29.7 cm"),
        ("material", "کاغذ ۷۰ گرامی، جلد مقوایی", "70 gsm paper, card cover"),
        ("contents", "۲۰۰ ورق، خط‌دار", "200 ruled sheets"),
        ("ageRange", "متعلم و محصل", "School and university"),
    ],
    features=[
        ("کاغذ ۷۰ گرامی", "70 gsm paper", "خودکار از پشت رد نمی‌شود.", "Ink does not bleed through."),
        ("صحافی فنری", "Spiral bound", "صفحه کامل باز می‌ماند.", "It lies completely flat."),
        ("جلد محکم", "Stiff cover", "در کیف تا نمی‌شود.", "It will not bend in a bag."),
    ],
)

P(
    "pen-set-blue-10",
    brand="Danesh",
    desc=(
        "بسته ۱۰ عددی خودکار آبی با نوک ۰.۷ میلی‌متر و جوهر روان. "
        "برای صنف، دفتر و امتحان — یک بسته یک ترم کامل دوام می‌آورد. "
        "بدنه شفاف است، پس می‌بینید چقدر جوهر مانده.",
        "A pack of ten blue pens with a 0.7 mm tip and smooth ink. For the classroom, "
        "the office and exams — one pack covers a full term. The barrel is clear, so "
        "you can see how much ink is left.",
    ),
    attrs=[
        ("brand", "دانش", "Danesh"),
        ("size", "نوک ۰.۷ میلی‌متر", "0.7 mm tip"),
        ("material", "بدنه پلاستیک شفاف", "Clear plastic barrel"),
        ("contents", "۱۰ خودکار آبی", "10 blue pens"),
        ("ageRange", "متعلم و اداری", "School and office"),
    ],
    features=[
        ("جوهر روان", "Smooth ink", "روی کاغذ گیر نمی‌کند.", "It does not drag on the page."),
        ("بدنه شفاف", "Clear barrel", "مقدار جوهر پیداست.", "You can see the ink level."),
        ("بسته ده‌تایی", "Pack of ten", "یک ترم کامل.", "A full term of writing."),
    ],
)

P(
    "backpack-school-navy",
    brand="Danesh",
    desc=(
        "بکس مکتب سرمه‌ای با سه جیب، جای کتابچه A4 و بند شانه لایه‌دار. "
        "پارچه آن ضد آب است، پس برف و باران به کتاب‌ها نمی‌رسد. "
        "برای متعلمان صنف چهار تا دوازده اندازه مناسبی دارد.",
        "A navy school backpack with three compartments, room for A4 notebooks and "
        "padded shoulder straps. The fabric is water resistant, so snow and rain do "
        "not reach the books. Sized for pupils from grade four to twelve.",
    ),
    attrs=[
        ("brand", "دانش", "Danesh"),
        ("size", "۴۵ × ۳۰ × ۱۵ سانتی‌متر", "45 × 30 × 15 cm"),
        ("material", "پلی‌استر ضد آب", "Water-resistant polyester"),
        ("contents", "سه جیب و جای بوتل آب", "Three compartments and a bottle pocket"),
        ("ageRange", "صنف ۴ تا ۱۲", "Grades 4 to 12"),
    ],
    features=[
        ("ضد آب", "Water resistant", "برف و باران به کتاب نمی‌رسد.", "Snow and rain stay off the books."),
        ("بند لایه‌دار", "Padded straps", "برای کتاب‌های سنگین.", "For a heavy load of books."),
        ("جای بوتل", "Bottle pocket", "در کنار، قابل دسترس.", "On the side, within reach."),
    ],
)

P(
    "colour-pencils-24",
    brand="Danesh",
    desc=(
        "بسته ۲۴ رنگ پنسل با مغز نرم که به‌راحتی نمی‌شکند و رنگ‌دهی یکدست دارد. "
        "چوب آن نرم است، پس با تراش معمولی هم خوب تراشیده می‌شود. "
        "در جعبه فلزی عرضه می‌شود که تا آخر سال دوام می‌آورد.",
        "A set of 24 colour pencils with soft cores that resist snapping and lay down "
        "colour evenly. The casing is soft wood, so an ordinary sharpener handles it. "
        "The metal tin lasts the school year.",
    ),
    attrs=[
        ("brand", "دانش", "Danesh"),
        ("size", "۱۷.۵ سانتی‌متر", "17.5 cm"),
        ("material", "چوب نرم با مغز رنگی", "Soft wood with pigment core"),
        ("contents", "۲۴ پنسل رنگی در جعبه فلزی", "24 pencils in a metal tin"),
        ("ageRange", "۵ سال به بالا", "5 years and up"),
    ],
    features=[
        ("مغز نرم", "Soft core", "به‌راحتی نمی‌شکند.", "It resists snapping."),
        ("جعبه فلزی", "Metal tin", "تا آخر سال دوام می‌آورد.", "It survives the school year."),
        ("۲۴ رنگ", "24 colours", "برای نقاشی صنفی کافی است.", "Enough for classroom art."),
    ],
)

P(
    "calculator-scientific",
    brand="Casio",
    model="fx-991",
    desc=(
        "ماشین حساب علمی با ۲۴۰ تابع، مناسب صنف ریاضی، فزیک و کانکور. "
        "صفحه دو خطی دارد و فرمول واردشده را هم‌زمان با جواب نشان می‌دهد. "
        "با باتری و آفتاب هر دو کار می‌کند، پس در امتحان خاموش نمی‌شود.",
        "A scientific calculator with 240 functions, right for maths, physics and the "
        "kankor. The two-line display shows the expression alongside the answer. It "
        "runs on battery and solar together, so it does not die during an exam.",
    ),
    attrs=[
        ("brand", "کاسیو", "Casio"),
        ("size", "۱۶ × ۸ سانتی‌متر", "16 × 8 cm"),
        ("material", "پلاستیک با قاب محافظ", "Plastic with a slide cover"),
        ("contents", "ماشین حساب و قاب", "Calculator and cover"),
        ("ageRange", "صنف ۱۰ به بالا", "Grade 10 and up"),
    ],
    features=[
        ("۲۴۰ تابع", "240 functions", "برای ریاضی، فزیک و کانکور.", "For maths, physics and the kankor."),
        ("صفحه دو خطی", "Two-line display", "فرمول و جواب با هم دیده می‌شوند.", "Expression and answer together."),
        ("باتری و آفتاب", "Battery and solar", "در امتحان خاموش نمی‌شود.", "It will not die mid-exam."),
    ],
)

# ---------------------------------------------------------------------------
# جواهرات هرات — Herat Jewellery
# ---------------------------------------------------------------------------

P(
    "gold-ring-21k-simple",
    desc=(
        "انگشتر طلای ۲۱ عیار با طرح ساده و پرداخت براق، وزن حدود ۴ گرام. "
        "طلای ۲۱ عیار همان عیاری است که در بازار کابل خرید و فروش می‌شود و ارزش خود را نگه می‌دارد. "
        "با فاکتور رسمی و مهر عیار تحویل می‌شود و سایز آن رایگان تنظیم می‌گردد.",
        "A 21-karat gold ring in a plain design with a polished finish, weighing about "
        "4 grams. Twenty-one karat is the standard traded in the Kabul market and it "
        "holds its value. It comes with a receipt and a hallmark, and we size it free "
        "of charge.",
    ),
    attrs=[
        ("material", "طلای زرد", "Yellow gold"),
        ("purity", "۲۱ عیار", "21 karat"),
        ("weight", "حدود ۴ گرام", "About 4 g"),
        ("origin", "ساخت هرات", "Made in Herat"),
        ("warranty", "فاکتور رسمی و مهر عیار", "Receipt and hallmark"),
    ],
    features=[
        ("۲۱ عیار", "21 karat", "عیار رایج بازار کابل.", "The standard traded in Kabul."),
        ("مهر و فاکتور", "Hallmarked", "با فاکتور رسمی تحویل می‌شود.", "Sold with a receipt."),
        ("تنظیم سایز رایگان", "Free sizing", "همین‌جا اندازه می‌شود.", "Sized at the counter."),
    ],
)

P(
    "silver-necklace-lapis",
    desc=(
        "گردنبند نقره ۹۲۵ با سنگ لاجورد بدخشان، همان لاجوردی که هزار سال است از این خاک می‌آید. "
        "قاب نقره دست‌ساز است و هر سنگ رگه‌های خودش را دارد، پس دو قطعه کاملاً یکسان نیست. "
        "زنجیر ۴۵ سانتی‌متری و قفل محکم دارد.",
        "A 925 silver necklace set with Badakhshan lapis — the same lapis that has come "
        "out of this ground for a thousand years. The silver setting is handmade and "
        "every stone carries its own veining, so no two pieces are identical. The "
        "chain is 45 cm with a secure clasp.",
    ),
    attrs=[
        ("material", "نقره ۹۲۵", "925 silver"),
        ("purity", "۹۲۵", "Sterling 925"),
        ("stone", "لاجورد بدخشان", "Badakhshan lapis lazuli"),
        ("weight", "حدود ۱۲ گرام", "About 12 g"),
        ("origin", "ساخت هرات", "Made in Herat"),
    ],
    features=[
        ("لاجورد بدخشان", "Badakhshan lapis", "سنگ محلی، نه شیشه رنگی.", "Local stone, not coloured glass."),
        ("قاب دست‌ساز", "Handmade setting", "هر قطعه کمی متفاوت است.", "Every piece is slightly different."),
        ("زنجیر ۴۵ سانتی", "45 cm chain", "با قفل محکم.", "With a secure clasp."),
    ],
)

P(
    "gold-earrings-pair",
    desc=(
        "گوشواره طلای ۲۱ عیار، یک جفت با طرح حلقه‌ای و قفل پشتی محکم. "
        "وزن مجموع حدود ۳.۵ گرام است و برای استفاده روزمره سبک است. "
        "با فاکتور رسمی و مهر عیار تحویل می‌شود.",
        "A pair of 21-karat gold earrings in a hoop design with a secure backing. The "
        "pair weighs about 3.5 grams, light enough for daily wear. Sold with a receipt "
        "and a hallmark.",
    ),
    attrs=[
        ("material", "طلای زرد", "Yellow gold"),
        ("purity", "۲۱ عیار", "21 karat"),
        ("weight", "حدود ۳.۵ گرام برای یک جفت", "About 3.5 g the pair"),
        ("origin", "ساخت هرات", "Made in Herat"),
        ("warranty", "فاکتور رسمی و مهر عیار", "Receipt and hallmark"),
    ],
    features=[
        ("قفل محکم", "Secure backing", "برای استفاده روزمره.", "Safe for everyday wear."),
        ("سبک", "Light", "۳.۵ گرام برای یک جفت.", "3.5 grams for the pair."),
        ("۲۱ عیار", "21 karat", "با مهر عیار.", "Hallmarked."),
    ],
)

P(
    "silver-bracelet-engraved",
    desc=(
        "دستبند نقره ۹۲۵ با حکاکی دستی نقش اسلیمی دور تا دور. "
        "حکاکی با قلم انجام شده، نه با قالب، پس خطوط عمق دارند. "
        "قفل فنری محکم دارد و اندازه آن قابل تنظیم است.",
        "A 925 silver bracelet engraved by hand with an islimi pattern all the way "
        "round. The engraving is cut with a chisel rather than pressed from a mould, "
        "so the lines have depth. A spring clasp holds it, and the size can be "
        "adjusted.",
    ),
    attrs=[
        ("material", "نقره ۹۲۵", "925 silver"),
        ("purity", "۹۲۵", "Sterling 925"),
        ("weight", "حدود ۲۰ گرام", "About 20 g"),
        ("origin", "ساخت هرات", "Made in Herat"),
        ("warranty", "تنظیم اندازه رایگان", "Free adjustment"),
    ],
    features=[
        ("حکاکی دستی", "Hand engraved", "با قلم، نه با قالب.", "Cut by hand, not pressed."),
        ("نقره ۹۲۵", "925 silver", "با مهر عیار.", "Hallmarked sterling."),
        ("اندازه قابل تنظیم", "Adjustable", "برای مچ باریک و پهن.", "For a narrow wrist or a wide one."),
    ],
)

P(
    "emerald-ring-silver",
    desc=(
        "انگشتر نقره با سنگ زمرد پنجشیر، تراش‌خورده و نصب‌شده در همین هرات. "
        "زمرد پنجشیر رنگ سبز عمیقی دارد که در نور روز بهتر دیده می‌شود. "
        "با گواهی سنگ و فاکتور رسمی تحویل داده می‌شود.",
        "A silver ring set with a Panjshir emerald, cut and mounted here in Herat. "
        "Panjshir emerald carries a deep green that shows best in daylight. It comes "
        "with a stone certificate and a receipt.",
    ),
    attrs=[
        ("material", "نقره ۹۲۵", "925 silver"),
        ("purity", "۹۲۵", "Sterling 925"),
        ("stone", "زمرد پنجشیر", "Panjshir emerald"),
        ("weight", "حدود ۸ گرام", "About 8 g"),
        ("origin", "ساخت هرات", "Made in Herat"),
        ("warranty", "گواهی سنگ", "Stone certificate"),
    ],
    features=[
        ("زمرد پنجشیر", "Panjshir emerald", "سنگ محلی با گواهی.", "Local stone, certified."),
        ("تراش دستی", "Hand cut", "تراش و نصب در هرات.", "Cut and mounted in Herat."),
        ("تنظیم سایز رایگان", "Free sizing", "همین‌جا اندازه می‌شود.", "Sized at the counter."),
    ],
)

# ---------------------------------------------------------------------------
# کیف زرین — Zarin Bags
# ---------------------------------------------------------------------------

P(
    "womens-handbag-leather",
    brand="Zarin",
    desc=(
        "کیف دستی زنانه از چرم مصنوعی درجه یک با آستر پارچه‌ای و سه جیب داخلی. "
        "بند شانه‌ای آن قابل جداشدن است، پس هم دستی و هم دوشی استفاده می‌شود. "
        "اندازه آن برای کتابچه A5، بوتل آب و لوازم روزمره کافی است.",
        "A women's handbag in good-quality synthetic leather with a fabric lining and "
        "three inner pockets. The shoulder strap detaches, so it works as a hand or "
        "shoulder bag. It fits an A5 notebook, a water bottle and the day's things.",
    ),
    attrs=[
        ("brand", "زرین", "Zarin"),
        ("material", "چرم مصنوعی با آستر پارچه‌ای", "Synthetic leather, fabric lined"),
        ("size", "۳۰ × ۲۲ × ۱۲ سانتی‌متر", "30 × 22 × 12 cm"),
        ("capacity", "حدود ۸ لیتر", "About 8 L"),
        ("colour", "مشکی، قهوه‌ای، شرابی", "Black, brown, wine"),
        ("care", "پاک کردن با تکه نمدار", "Wipe with a damp cloth"),
    ],
    features=[
        ("بند جداشدنی", "Detachable strap", "دستی یا دوشی، هر دو.", "Carry it by hand or on the shoulder."),
        ("سه جیب داخلی", "Three inner pockets", "برای موبایل، کیف پول و کلید.", "For a phone, a purse and keys."),
        ("آستر پارچه‌ای", "Fabric lining", "دوخت تمیز، بدون درز باز.", "Clean seams, nothing left raw."),
    ],
)

P(
    "travel-suitcase-24",
    brand="Zarin",
    desc=(
        "چمدان ۲۴ اینچ با بدنه سخت ABS و چهار چرخ ۳۶۰ درجه که در فرودگاه به‌راحتی می‌چرخد. "
        "قفل رمزی سه‌رقمی دارد و بدنه سخت وسایل شکستنی را در بار هوایی محافظت می‌کند. "
        "اندازه آن برای سفر یک تا دو هفته مناسب است.",
        "A 24-inch suitcase with a hard ABS shell and four spinner wheels that turn "
        "easily in an airport. It has a three-digit combination lock, and the hard "
        "shell protects fragile things in the hold. Sized for a one to two week trip.",
    ),
    attrs=[
        ("brand", "زرین", "Zarin"),
        ("material", "بدنه سخت ABS", "Hard ABS shell"),
        ("size", "۲۴ اینچ — ۶۵ × ۴۴ × ۲۶ سانتی‌متر", '24" — 65 × 44 × 26 cm'),
        ("capacity", "حدود ۶۵ لیتر", "About 65 L"),
        ("colour", "سرمه‌ای، نقره‌ای، مشکی", "Navy, silver, black"),
        ("care", "پاک کردن با تکه نمدار", "Wipe with a damp cloth"),
    ],
    features=[
        ("چهار چرخ ۳۶۰ درجه", "Four spinner wheels", "در فرودگاه با یک دست می‌چرخد.", "It turns one-handed in an airport."),
        ("قفل رمزی", "Combination lock", "سه رقمی، قابل تنظیم.", "Three digits, resettable."),
        ("بدنه سخت", "Hard shell", "برای بار هوایی.", "Made for the hold."),
    ],
)

P(
    "laptop-bag-15",
    brand="Zarin",
    desc=(
        "کیف لپ‌تاپ ۱۵ اینچ با لایه ضربه‌گیر و جیب جداگانه برای شارژر و کاغذ. "
        "پارچه بیرونی ضد آب است و درز‌های آن دوخت دوبل دارد. "
        "بند شانه لایه‌دار دارد و دسته آن برای حمل کوتاه هم راحت است.",
        "A 15-inch laptop bag with a padded sleeve and a separate compartment for the "
        "charger and papers. The outer fabric is water resistant and the seams are "
        "double stitched. A padded shoulder strap plus a grab handle for short "
        "carries.",
    ),
    attrs=[
        ("brand", "زرین", "Zarin"),
        ("material", "پلی‌استر ضد آب با لایه ضربه‌گیر", "Water-resistant polyester, padded"),
        ("size", "۴۰ × ۳۰ × ۸ سانتی‌متر", "40 × 30 × 8 cm"),
        ("capacity", "لپ‌تاپ تا ۱۵.۶ اینچ", 'Laptops up to 15.6"'),
        ("colour", "مشکی، خاکستری", "Black, grey"),
        ("care", "پاک کردن با تکه نمدار", "Wipe with a damp cloth"),
    ],
    features=[
        ("لایه ضربه‌گیر", "Padded sleeve", "لپ‌تاپ در برابر ضربه محافظت می‌شود.", "It protects the laptop from knocks."),
        ("جیب شارژر", "Charger pocket", "جدا از لپ‌تاپ، بدون خط انداختن.", "Separate, so nothing scratches."),
        ("دوخت دوبل", "Double stitched", "درز‌ها زیر بار باز نمی‌شوند.", "Seams hold under load."),
    ],
)

P(
    "crossbody-small-bag",
    brand="Zarin",
    desc=(
        "کیف دوشی کوچک برای موبایل، کیف پول و کلید — همان مقداری که برای بیرون رفتن لازم است. "
        "بند بلند و قابل تنظیم دارد و روی سینه یا پهلو بسته می‌شود. "
        "زیپ اصلی آن دو طرفه است و جیب پشتی پنهان دارد.",
        "A small crossbody bag for a phone, a purse and keys — the amount you actually "
        "need to leave the house. The long strap adjusts and sits across the chest or "
        "at the hip. The main zip runs both ways and there is a hidden back pocket.",
    ),
    attrs=[
        ("brand", "زرین", "Zarin"),
        ("material", "چرم مصنوعی", "Synthetic leather"),
        ("size", "۱۹ × ۱۴ × ۶ سانتی‌متر", "19 × 14 × 6 cm"),
        ("capacity", "حدود ۱.۵ لیتر", "About 1.5 L"),
        ("colour", "مشکی، کریمی، سرخ", "Black, cream, red"),
        ("care", "پاک کردن با تکه نمدار", "Wipe with a damp cloth"),
    ],
    features=[
        ("جیب پنهان", "Hidden pocket", "پشت کیف، برای پول.", "At the back, for cash."),
        ("بند قابل تنظیم", "Adjustable strap", "روی سینه یا پهلو.", "Across the chest or at the hip."),
        ("سبک", "Light", "برای بیرون رفتن کوتاه.", "For a short trip out."),
    ],
)

P(
    "duffel-gym-bag",
    brand="Zarin",
    desc=(
        "بکس ورزشی با جیب جداگانه برای بوت و جیب توری برای لباس نمدار. "
        "پارچه آن ضد آب است و کف آن تقویت شده تا روی زمین جیم خراب نشود. "
        "بند دوشی و دو دسته دارد و برای سفر کوتاه هم استفاده می‌شود.",
        "A gym duffel with a separate shoe compartment and a mesh pocket for wet kit. "
        "The fabric is water resistant and the base is reinforced against a gym floor. "
        "It has a shoulder strap and two handles, and doubles as a weekend bag.",
    ),
    attrs=[
        ("brand", "زرین", "Zarin"),
        ("material", "پلی‌استر ضد آب", "Water-resistant polyester"),
        ("size", "۵۰ × ۲۸ × ۲۸ سانتی‌متر", "50 × 28 × 28 cm"),
        ("capacity", "حدود ۳۵ لیتر", "About 35 L"),
        ("colour", "مشکی، سرمه‌ای", "Black, navy"),
        ("care", "شستشوی دستی", "Hand wash"),
    ],
    features=[
        ("جیب بوت", "Shoe compartment", "جدا از لباس تمیز.", "Kept away from clean kit."),
        ("جیب توری", "Mesh pocket", "برای لباس نمدار بعد از تمرین.", "For wet kit after training."),
        ("کف تقویت‌شده", "Reinforced base", "روی زمین جیم خراب نمی‌شود.", "It survives a gym floor."),
    ],
)

# ---------------------------------------------------------------------------
# ورزشی البرز — Alborz Sports
# ---------------------------------------------------------------------------

P(
    "tracksuit-mens-navy",
    brand="Alborz",
    desc=(
        "دریس ورزشی مردانه دو تکه از پارچه پنبه‌پلی‌استر، برای تمرین و پوشیدن روزمره. "
        "کش کمر و بند تنظیم دارد و جیب‌های زیپ‌دار برای موبایل و کلید. "
        "بعد از شستن جمع نمی‌شود و رنگ نمی‌دهد.",
        "A men's two-piece tracksuit in a cotton-polyester blend, for training and for "
        "everyday wear. The waist has elastic and a drawcord, and the pockets zip for "
        "a phone and keys. It does not shrink or bleed in the wash.",
    ),
    attrs=[
        ("brand", "البرز", "Alborz"),
        ("material", "۶۰٪ نخ، ۴۰٪ پلی‌استر", "60% cotton, 40% polyester"),
        ("sizes", "M، L، XL، XXL", "M, L, XL, XXL"),
        ("colour", "سرمه‌ای، مشکی، خاکستری", "Navy, black, grey"),
        ("gender", "مردانه", "Men"),
        ("care", "شستشوی ماشینی با آب سرد", "Machine wash cold"),
    ],
    features=[
        ("جیب زیپ‌دار", "Zip pockets", "موبایل هنگام دویدن نمی‌افتد.", "A phone stays put while running."),
        ("بدون آبرفت", "No shrinkage", "بعد از شستن اندازه می‌ماند.", "It keeps its size in the wash."),
        ("دو تکه", "Two pieces", "بالا و پایین، با هم.", "Top and bottom together."),
    ],
)

P(
    "cricket-bat-kashmir",
    brand="Alborz",
    desc=(
        "بت کرکت از چوب بید کشمیر با دسته چوب‌پنبه‌ای و روکش لاستیکی. "
        "وزن آن حدود ۱.۲ کیلوگرام است — تعادل خوبی برای بازیکن نوجوان و بزرگسال. "
        "پیش از بازی جدی، چند ساعت روغن‌کاری و نرم‌کردن لبه لازم دارد.",
        "A cricket bat in Kashmir willow with a cane handle and a rubber grip. It "
        "weighs about 1.2 kg, a balance that suits a teenager and an adult alike. "
        "Before serious play it needs a few hours of oiling and knocking in.",
    ),
    attrs=[
        ("brand", "البرز", "Alborz"),
        ("material", "چوب بید کشمیر", "Kashmir willow"),
        ("sizes", "سایز کامل — ۸۵ سانتی‌متر", "Full size — 85 cm"),
        ("colour", "چوب طبیعی", "Natural wood"),
        ("gender", "نوجوان و بزرگسال", "Teenagers and adults"),
        ("care", "روغن‌کاری پیش از فصل", "Oil before the season"),
    ],
    features=[
        ("بید کشمیر", "Kashmir willow", "سبک‌تر از بید انگلیسی، ارزان‌تر هم.", "Lighter than English willow, and cheaper."),
        ("دسته چوب‌پنبه", "Cane handle", "ضربه را کمتر به دست منتقل می‌کند.", "It takes the shock out of a shot."),
        ("روکش لاستیکی", "Rubber grip", "در دست عرق‌کرده هم نمی‌لغزد.", "It holds in a sweaty hand."),
    ],
)

P(
    "football-jersey-team",
    brand="Alborz",
    desc=(
        "جرسی فوتبال از پارچه مش تنفسی که عرق را زود خشک می‌کند. "
        "برای تیم‌های محلی مناسب است و چاپ نام و شماره در همین دکان انجام می‌شود. "
        "سبک است و بعد از شستن سریع خشک می‌شود.",
        "A football jersey in breathable mesh that dries sweat quickly. It suits local "
        "teams, and we print names and numbers here in the shop. It is light and dries "
        "fast after a wash.",
    ),
    attrs=[
        ("brand", "البرز", "Alborz"),
        ("material", "۱۰۰٪ پلی‌استر مش", "100% polyester mesh"),
        ("sizes", "S، M، L، XL", "S, M, L, XL"),
        ("colour", "سرخ، آبی، سبز", "Red, blue, green"),
        ("gender", "مردانه و نوجوان", "Men and teenagers"),
        ("care", "شستشوی ماشینی با آب سرد", "Machine wash cold"),
    ],
    features=[
        ("پارچه تنفسی", "Breathable mesh", "عرق را زود خشک می‌کند.", "It dries sweat fast."),
        ("چاپ نام و شماره", "Name and number printing", "در همین دکان انجام می‌شود.", "Done here at the counter."),
        ("خشک‌شدن سریع", "Quick drying", "بعد از شستن، همان روز آماده.", "Ready the same day after a wash."),
    ],
)

P(
    "dumbbell-set-10kg",
    brand="Alborz",
    desc=(
        "ست دمبل ۱۰ کیلوگرامی با وزنه‌های قابل تعویض و روکش پلاستیکی. "
        "روکش از خط افتادن فرش و کاشی جلوگیری می‌کند و صدای برخورد را کم می‌کند. "
        "برای تمرین خانگی و مبتدی مناسب است و در جعبه با پیچ‌های محکم عرضه می‌شود.",
        "A 10 kg dumbbell set with removable plates and a plastic coating. The coating "
        "protects carpet and tile and keeps the noise down. Right for home training "
        "and for beginners; it comes boxed with secure collars.",
    ),
    attrs=[
        ("brand", "البرز", "Alborz"),
        ("material", "سمنت با روکش پلاستیکی", "Cement core, plastic coated"),
        ("sizes", "مجموع ۱۰ کیلوگرام", "10 kg total"),
        ("colour", "مشکی", "Black"),
        ("gender", "مردانه و زنانه", "Men and women"),
        ("care", "خشک نگه داشتن", "Keep dry"),
    ],
    features=[
        ("وزنه قابل تعویض", "Removable plates", "از ۲ تا ۱۰ کیلو قابل تنظیم.", "Adjustable from 2 to 10 kg."),
        ("روکش پلاستیکی", "Plastic coating", "فرش و کاشی خط نمی‌افتد.", "It will not mark carpet or tile."),
        ("مناسب خانه", "Home friendly", "صدای برخورد کم.", "Quiet when it lands."),
    ],
)

P(
    "yoga-mat-6mm",
    brand="Alborz",
    desc=(
        "تشک یوگا ۶ میلی‌متری با سطح ضد لغزش در هر دو رو. "
        "ضخامت ۶ میلی‌متر برای زانو روی کاشی سرد کافی است. "
        "با بند حمل عرضه می‌شود و جمع‌شده در کمد جا می‌گیرد.",
        "A 6 mm yoga mat with a non-slip surface on both faces. Six millimetres is "
        "enough padding for knees on a cold tile floor. It comes with a carry strap "
        "and rolls small enough for a cupboard.",
    ),
    attrs=[
        ("brand", "البرز", "Alborz"),
        ("material", "فوم NBR بدون بو", "Odour-free NBR foam"),
        ("sizes", "۱۸۳ × ۶۱ سانتی‌متر، ۶ میلی‌متر", "183 × 61 cm, 6 mm"),
        ("colour", "بنفش، آبی، خاکستری", "Purple, blue, grey"),
        ("gender", "مردانه و زنانه", "Men and women"),
        ("care", "پاک کردن با تکه نمدار", "Wipe with a damp cloth"),
    ],
    features=[
        ("ضد لغزش دو رو", "Non-slip both sides", "روی کاشی و قالین.", "On tile and on carpet."),
        ("۶ میلی‌متر", "6 mm thick", "برای زانو روی زمین سرد.", "Enough for knees on a cold floor."),
        ("بند حمل", "Carry strap", "جمع‌شده قابل حمل است.", "Rolls up and carries easily."),
    ],
)

# ---------------------------------------------------------------------------
# خشکبار و شیرینی کابل — Kabul Dried Fruit & Sweets
# ---------------------------------------------------------------------------

P(
    "pistachio-roasted-1kg",
    desc=(
        "پسته بریان‌شده و نمک‌زده یک کیلویی، از باغ‌های سمنگان. "
        "هر روز صبح بریان می‌شود، پس آنچه می‌خرید تازه است نه انبارشده. "
        "در بسته زیپ‌دار عرضه می‌شود تا بعد از باز کردن هم تازه بماند.",
        "A kilo of roasted, salted pistachios from the Samangan orchards. They are "
        "roasted each morning, so what you buy is fresh rather than stored. Sold in a "
        "resealable bag so they stay crisp after opening.",
    ),
    attrs=[
        ("weight", "۱ کیلوگرام", "1 kg"),
        ("origin", "سمنگان", "Samangan"),
        ("ingredients", "پسته، نمک", "Pistachios, salt"),
        ("shelfLife", "۶ ماه", "6 months"),
        ("storage", "جای خشک و خنک", "Cool and dry"),
    ],
    features=[
        ("بریان روزانه", "Roasted daily", "هر صبح تازه بریان می‌شود.", "Roasted fresh every morning."),
        ("پسته سمنگان", "Samangan pistachios", "از باغ‌های خود کشور.", "From orchards in the country."),
        ("بسته زیپ‌دار", "Resealable bag", "بعد از باز کردن هم تازه می‌ماند.", "It stays crisp after opening."),
    ],
)

P(
    "almond-qahqaha-1kg",
    desc=(
        "بادام قهقهه یک کیلویی، همان بادام کاغذی که پوستش با دست شکسته می‌شود. "
        "مغز آن شیرین و پرچرب است و برای مهمانی و نوروز مناسب. "
        "امسال از باغ‌های اورزگان و در بسته زیپ‌دار.",
        "A kilo of qahqaha almonds — the paper-shell almond you can crack with your "
        "fingers. The kernel is sweet and rich, right for guests and for Nowruz. This "
        "year's crop from Uruzgan, in a resealable bag.",
    ),
    attrs=[
        ("weight", "۱ کیلوگرام", "1 kg"),
        ("origin", "اورزگان", "Uruzgan"),
        ("ingredients", "بادام با پوست", "Almonds, in shell"),
        ("shelfLife", "۱۲ ماه", "12 months"),
        ("storage", "جای خشک و خنک", "Cool and dry"),
    ],
    features=[
        ("پوست کاغذی", "Paper shell", "با دست شکسته می‌شود.", "It cracks with your fingers."),
        ("محصول امسال", "This year's crop", "نه انبار سال گذشته.", "Not last season's store."),
        ("مناسب نوروز", "For Nowruz", "برای میز مهمانی.", "For the guest table."),
    ],
)

P(
    "raisin-green-1kg",
    desc=(
        "کشمش سبز یک کیلویی از تاکستان‌های شمالی، بدون هسته و بدون شکر افزوده. "
        "در سایه خشک شده، به همین دلیل رنگ سبزش را نگه داشته است. "
        "برای چای، شیرینی‌پزی و صبحانه.",
        "A kilo of green raisins from the northern vineyards, seedless and with no "
        "added sugar. They are shade-dried, which is why they keep their green colour. "
        "For tea, for baking and for breakfast.",
    ),
    attrs=[
        ("weight", "۱ کیلوگرام", "1 kg"),
        ("origin", "شمالی", "Shomali plain"),
        ("ingredients", "انگور خشک‌شده", "Dried grapes"),
        ("shelfLife", "۱۲ ماه", "12 months"),
        ("storage", "جای خشک و خنک", "Cool and dry"),
    ],
    features=[
        ("خشک‌شده در سایه", "Shade dried", "رنگ سبز طبیعی را نگه می‌دارد.", "It keeps the natural green."),
        ("بدون شکر", "No added sugar", "شیرینی طبیعی انگور.", "Only the sweetness of the grape."),
        ("بدون هسته", "Seedless", "برای شیرینی‌پزی آماده.", "Ready for baking."),
    ],
)

P(
    "walnut-shelled-1kg",
    desc=(
        "چهارمغز پوست‌کنده یک کیلویی از باغ‌های پروان، مغزهای درشت و کامل. "
        "پوست‌کندن با دست انجام شده، پس مغزها شکسته و خرد نیستند. "
        "در جای خنک نگه دارید تا روغن آن تلخ نشود.",
        "A kilo of shelled walnuts from the Parwan orchards, large and mostly whole. "
        "They are shelled by hand, so the halves are not crushed. Keep them cool so "
        "the oil does not turn.",
    ),
    attrs=[
        ("weight", "۱ کیلوگرام", "1 kg"),
        ("origin", "پروان", "Parwan"),
        ("ingredients", "مغز چهارمغز", "Walnut kernels"),
        ("shelfLife", "۶ ماه", "6 months"),
        ("storage", "یخچال یا جای خنک", "Refrigerate or keep cool"),
    ],
    features=[
        ("پوست‌کندن دستی", "Hand shelled", "مغزها کامل و نشکسته.", "The halves stay whole."),
        ("باغ‌های پروان", "Parwan orchards", "محصول محلی همین فصل.", "Local, this season."),
        ("مغز درشت", "Large kernels", "برای شیرینی و آش.", "For sweets and for aash."),
    ],
)

P(
    "sweets-gift-box",
    desc=(
        "جعبه شیرینی مخلوط با نقل، شکرپاره، نان خطایی و کلچه بادامی. "
        "برای عید، مهمانی و خواستگاری آماده می‌شود و بسته‌بندی آن هدیه‌ای است. "
        "شیرینی‌ها هفته‌ای دو بار تازه پخته می‌شوند.",
        "A mixed sweets box with noql, shakarpara, nan-e khatai and almond kulcha. "
        "Assembled for Eid, for guests and for an engagement visit, and the box is "
        "made to be given. The sweets are baked fresh twice a week.",
    ),
    attrs=[
        ("weight", "۱.۲ کیلوگرام", "1.2 kg"),
        ("origin", "پخت کابل", "Baked in Kabul"),
        ("ingredients", "آرد، شکر، بادام، روغن، هیل", "Flour, sugar, almond, oil, cardamom"),
        ("shelfLife", "۳ هفته", "3 weeks"),
        ("storage", "جای خشک، دور از آفتاب", "Dry, out of the sun"),
    ],
    features=[
        ("چهار نوع شیرینی", "Four kinds", "نقل، شکرپاره، نان خطایی، کلچه بادامی.", "Noql, shakarpara, nan-e khatai and almond kulcha."),
        ("پخت هفتگی", "Baked weekly", "هفته‌ای دو بار تازه.", "Fresh twice a week."),
        ("بسته‌بندی هدیه", "Gift packed", "آماده برای عید و مهمانی.", "Ready for Eid and for guests."),
    ],
)

P(
    "dried-apricot-1kg",
    desc=(
        "زردآلوی خشک یک کیلویی از باغ‌های وردک، بدون گوگرد و بدون رنگ افزوده. "
        "چون گوگرد نخورده، رنگش تیره‌تر از نمونه‌های وارداتی است — و طعمش شیرین‌تر. "
        "برای کمپوت، آش و خوردن مستقیم.",
        "A kilo of dried apricots from the Wardak orchards, unsulphured and with no "
        "added colour. Because they are not sulphured they look darker than imported "
        "fruit — and taste sweeter. For compote, for aash and for eating as they are.",
    ),
    attrs=[
        ("weight", "۱ کیلوگرام", "1 kg"),
        ("origin", "وردک", "Wardak"),
        ("ingredients", "زردآلوی خشک‌شده", "Dried apricots"),
        ("shelfLife", "۹ ماه", "9 months"),
        ("storage", "جای خشک و خنک", "Cool and dry"),
    ],
    features=[
        ("بدون گوگرد", "Unsulphured", "رنگ تیره‌تر، طعم شیرین‌تر.", "Darker in colour, sweeter in taste."),
        ("باغ‌های وردک", "Wardak orchards", "محصول محلی.", "A local crop."),
        ("بدون رنگ افزوده", "No added colour", "همان رنگ طبیعی میوه.", "The fruit's own colour."),
    ],
)


def main() -> None:
    path = OUT / "product-details.json"
    path.write_text(json.dumps(DETAILS, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    specs = sum(len(entry["attributes"]) for entry in DETAILS.values())
    features = sum(len(entry["features"]) for entry in DETAILS.values())
    print(f"wrote {path.relative_to(OUT.parent.parent)}")
    print(f"  {len(DETAILS)} products · {specs} spec rows · {features} features")

    thin = [
        slug
        for slug, entry in DETAILS.items()
        if len(entry["attributes"]) < 4 or len(entry["features"]) < 3
    ]
    if thin:
        raise SystemExit(f"these products are too thin for the product page: {thin}")


if __name__ == "__main__":
    main()
