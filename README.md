# نظام VIP — RA3D BET

## ما تم تنفيذه محليًا

تم تحديث نسختي المستخدم والأدمن لإضافة نظام اشتراكات VIP متكامل من حيث الواجهة والتدفق الأساسي. يستطيع الأدمن التحكم في تفعيل النظام، رقم Vodafone Cash، تعليمات الدفع، وأسعار الباقات الأسبوعية والشهرية وباقة الثلاثة أشهر. يستطيع الأدمن أيضًا إنشاء أكواد بعدد ومدة يحددها، مشاهدة حالة الأكواد، وإيقاف أي كود.

في نسخة المستخدم أضيفت صفحة اشتراك VIP تعرض الباقات، رقم التحويل مع زر نسخ، تعليمات التحويل اليدوي، وحقل كود VIP. عند نجاح التفعيل يظهر تاريخ الانتهاء، ويجري تعطيل الحالة محليًا عند انتهاء المدة، كما يُمنع الكود من الاستخدام مرة أخرى بعد تسجيله كمستخدم في Firestore.

## ملفات التسليم

- `index.html`: نسخة المستخدم المعدلة.
- `admin.html`: نسخة الأدمن المعدلة.

## بنية Firestore المستخدمة

- `config/settings.vipSettings`: إعدادات النظام والباقات ورقم Vodafone Cash.
- `vipCodes/{CODE}`: الكود، عدد الأيام، حالة الاستخدام، الجهاز الذي فعّله، وتاريخ التفعيل والانتهاء.
- `adminLog`: سجل عمليات الأدمن.

## شرط مهم قبل النشر

النسخة الحالية تحتوي على منطق المتصفح وتستخدم معاملة قراءة ثم تحديث للكود. للحماية الاحترافية من تغيير ساعة الجهاز أو التلاعب بطلبات Firestore، يجب قبل النشر تطبيق قواعد Firestore أو Cloud Function تتحقق من الكود وتستهلكه ذريًا على الخادم، وتمنع الكتابة المباشرة من المستخدمين. كما يجب اختبار صلاحيات الأدمن على مشروع Firebase الفعلي وعدم الاعتماد على إخفاء الواجهة أو فحص البريد داخل JavaScript وحده.

لم يتم تغيير مشروع Firebase الفعلي، ولم يتم وضع رقم Vodafone Cash حقيقي، ولم يتم نشر أي ملف.

## 𝙍𝘼𝟯𝘿 𝘽𝙀𝙏 publishing notes

The frontend identity is 𝙍𝘼𝟯𝘿 𝘽𝙀𝙏, developer R3, with Telegram https://t.me/Ech0_k and Firebase project `ra3d-bet`. The privacy policy is an independent project-specific page.

AdSense is prepared with a placeholder publisher ID `ca-pub-XXXXXXXXXXXXXXXX`. Replace it only with the owner's own AdSense publisher ID after Google approves the site. The previous publisher ID from the source project was intentionally not reused.
