# 💰 Kişisel Gelir Gider Hesaplama

Java Swing ile yazılmış, harici kütüphane kullanmayan masaüstü finans takip uygulaması.

## ✨ Özellikler

- ✅ Gelir / Gider işlemi ekleme, düzenleme, silme
- ✅ Kategori bazlı bütçe limiti ve uyarı sistemi (limit aşımı / %80 uyarısı)
- ✅ Canlı arama (kategori ve açıklama üzerinden)
- ✅ Ay bazlı filtreleme
- ✅ Kategori bazlı pasta grafiği (harici kütüphane yok)
- ✅ Aylık gelir/gider trend grafiği
- ✅ CSV dışa aktarma (Excel uyumlu, UTF-8 BOM)
- ✅ Açık / Koyu tema desteği
- ✅ Veriler kalıcı olarak `~/.finansapp/data.txt` içinde saklanır

## 🚀 Nasıl Çalıştırılır

### Gereksinimler

- Java 8 veya üzeri (geliştirme için JDK 17+ önerilir)

### Kaynaktan Derleme

```bash
cd src
javac -encoding UTF-8 FinanceAppGUI.java
java FinanceAppGUI
```

### JAR Olarak Paketleme

```bash
cd src
jar cfe ../FinanceApp.jar FinanceAppGUI *.class
java -jar ../FinanceApp.jar
```

### Windows EXE (JDK 17+)

```bash
jpackage --type app-image --name FinansApp ^
  --input . ^
  --main-jar FinanceApp.jar ^
  --main-class FinanceAppGUI ^
  --dest output
```

Sonuç: `output\FinansApp\FinansApp.exe` — Java kurulu olmayan bilgisayarlarda da çalışır (runtime gömülü).

## 📂 Proje Yapısı

```
finans-app/
├── src/
│   └── FinanceAppGUI.java     # Tüm uygulama (tek dosya)
├── .gitignore
├── README.md
└── LICENSE.txt
```

## 💾 Veri Saklama

Uygulama verileri şu dosyada saklanır:

- **Windows:** `C:\Users\<kullanıcı>\.finansapp\data.txt`
- **Linux/macOS:** `~/.finansapp/data.txt`

Dosya formatı (noktalı virgülle ayrılmış):

```
INITIAL_BALANCE;5000.00
BUDGET;market;2000.00
TRANSACTION;1;Maaş;15000.00;Maaş;INCOME;2024-03-01
TRANSACTION;2;Market alışverişi;450.75;Market;EXPENSE;2024-03-02
```

## License
Apache License 2.0