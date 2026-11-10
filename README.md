# LUMEN Paper Maker 📝

HSC বিজ্ঞান ও সাধারণ বিষয়ের MCQ এবং সৃজনশীল (CQ) প্রশ্নপত্র তৈরির আধুনিক ওয়েব ও Progressive Web App (PWA)।

---

## ✨ বৈশিষ্ট্যসমূহ (Features)

- 📱 **Progressive Web App (PWA)**: যেকোনো Android, iPhone বা কম্পিউটারে সরাসরি অ্যাপের মতো ইনস্টল করে ব্যবহার করা যায়।
- ⚡ **অফলাইন সাপোর্ট (Offline Ready)**: Service Worker ক্যাশিং থাকায় ইন্টারনেট ধীরগতির বা বিচ্ছিন্ন হলেও পূর্বে লোড করা বিষয়াবলি কাজ করবে।
- 🎯 **৩টি প্রশ্ন বাছাই মোড**:
  1. **Random mix**: নির্বাচিত বিষয় থেকে স্বয়ংক্রিয়ভাবে প্রশ্ন মিশ্রিত করে তৈরি।
  2. **নির্দিষ্ট অধ্যায়**: নিজের পছন্দমতো অধ্যায় নির্বাচন।
  3. **নিজে প্রশ্ন বাছাই**: প্রশ্নব্যাংক দেখে দেখে পছন্দমতো প্রশ্ন টিক দিয়ে তৈরি।
- 🖨️ **প্রিন্ট ও PDF এক্সপোর্ট**: এক ক্লিকে A4 সাইজে প্রিন্ট উপযোগী প্রশ্নপত্র তৈরি।
- 🔢 **LaTeX / KaTeX ম্যাথ সমীকরণ**: গণিত ও বিজ্ঞানের জটিল সমীকরণ ও প্রতীক যথাযথভাবে রেন্ডার হয়।
- 📋 **উত্তরপত্র ও ব্যাখ্যা**: স্বয়ংক্রিয় Answer Key ও ব্যাখ্যা সহ প্রশ্নপত্র তৈরির সুবিধা।

---

## 🚀 GitHub Pages-এ লাইভ করার নিয়ম (Live Hosting Guide)

এই অ্যাপটি ১০০% ক্লায়েন্ট-সাইড স্ট্যাটিক অ্যাপ। কোনো সার্ভার কনফিগারেশন ছাড়াই GitHub Pages দিয়ে এটি বিনামূল্যে লাইভ করা যায়:

1. **GitHub-এ নতুন রিপোজিটরি তৈরি করুন**:
   - [github.com/new](https://github.com/new) এ যান।
   - রিপোজিটরির নাম দিন (যেমন: `lumen-paper-maker`).
   - এটি **Public** রাখুন এবং Create Repository চাপুন।

2. **কোড পুশ করুন (Terminal / PowerShell)**:
   ```bash
   git init
   git add .
   git commit -m "feat: complete PWA setup for mobile & live link"
   git branch -M main
   git remote add origin https://github.com/<YOUR_USERNAME>/<REPO_NAME>.git
   git push -u origin main
   ```

3. **GitHub Pages চালু করুন**:
   - GitHub রিপোজিটরির **Settings** ট্যাবে যান।
   - বাম মেনু থেকে **Pages** এ ক্লিক করুন।
   - **Branch** ড্রপডাউনে `main` এবং ফোল্ডার `/ (root)` সিলেক্ট করে **Save** চাপুন।
   - ১-২ মিনিটের মধ্যে আপনার লাইভ লিঙ্ক তৈরি হয়ে যাবে:
     `https://<YOUR_USERNAME>.github.io/<REPO_NAME>/`

---

## 📲 মোবাইলে PWA হিসেবে ইনস্টল করার নিয়ম

1. **Android (Chrome / Edge / Samsung Internet)**:
   - লাইভ লিঙ্কে প্রবেশ করার পর উপরের **📲 অ্যাপ ইনস্টল** বাটনে চাপুন অথবা ব্রাউজারের থ্রি-ডট (⋮) মেনু থেকে **Install App** বা **Add to Home screen** চাপুন।
2. **iPhone / iPad (Safari)**:
   - Safari-তে লাইভ লিঙ্কটি খুলুন।
   - নিচে ব্রাউজারের **Share** (শেয়ার) বাটনে ট্যাপ করে **Add to Home Screen** সিলেক্ট করুন।

---

## 💻 লোকালভাবে চালানোর নিয়ম (Local Run)

সরাসরি ব্রাউজারে `index.html` খুলুন, অথবা:
```bash
# Node / NPX ব্যবহার করে লোকাল সার্ভার
npx serve .
```
কিংবা উইন্ডোজে `launch.bat` ফাইলে ডাবল-ক্লিক করুন।

