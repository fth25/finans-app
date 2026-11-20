# Parabu'yu ücretsiz yayımlama

Bu kurulum Cloudflare Pages'in ücretsiz statik yayınını ve Supabase Free projesinin
kimlik doğrulama/veritabanını kullanır. Node sunucusu veya ücretli kalıcı disk
gerektirmez.

## 1. Supabase projesi

1. Supabase'de Free planda bir proje oluşturun. Ücretli plana veya eklentiye geçmeyin.
2. **SQL Editor** bölümünde `supabase/schema.sql` içeriğini çalıştırın. Bu tablo yalnızca
   oturum açmış kullanıcının kendi finans verisini okuyup yazmasına izin verir.
3. **Authentication > URL Configuration** bölümünde Site URL'yi daha sonra oluşacak
   Cloudflare Pages adresiniz olarak ayarlayın. Aynı adresi Redirect URLs listesine de
   ekleyin.
4. **Authentication > Providers > Email** ayarlarında e-posta doğrulamasını açık tutun.
   Kayıt olan kişiler doğrulama e-postasındaki bağlantıya basarak oturum açabilir.

## 2. Cloudflare Pages

1. Projeyi kendi GitHub hesabınızda bir depoya koyun. `.gitignore`, yerel
   `server/.env` ve SQLite veritabanı dosyalarının depoya eklenmesini engeller.
2. Cloudflare'da **Workers & Pages > Create > Pages > Connect to Git** adımlarını izleyip
   `finans-app` deposunu bağlayın. Site `web/` alt klasöründeyse **Root directory** olarak
   `web` seçin.
3. Framework preset olarak **None**, build command olarak `npm run build`, build output
   directory olarak `dist` seçin.
4. Supabase **Settings > API Keys** bölümünden yeni **Publishable key** ve **Secret key**
   anahtarlarını kullanın. Pages projesinin **Settings > Variables and Secrets** bölümünde
   Production ortamına şu değerleri ekleyin:
   - `SUPABASE_URL`: Supabase projesinin Project URL değeri.
   - `SUPABASE_PUBLISHABLE_KEY`: Supabase'in `sb_publishable_...` anahtarı. Bu anahtarın
     tarayıcıya verilmesi normaldir; erişimi veritabanındaki RLS politikaları sınırlar.
   - `SUPABASE_SECRET_KEY`: Supabase'in `sb_secret_...` anahtarı. Bunu yalnızca **Secret**
     olarak kaydedin; koda, GitHub'a veya kullanıcı arayüzüne koymayın.
5. İlk yayın tamamlanınca Cloudflare Pages adresinizi Supabase Site URL ve Redirect URLs
   ayarlarına ekleyin. Yeniden deploy edin.
6. `/api/config` adresinin 200 döndürdüğünü, ardından kayıt, e-posta doğrulama, giriş,
   veri senkronizasyonu ve hesap silme akışlarını test edin.
7. Yeni anahtarlarla çalışan dağıtımı doğruladıktan sonra Supabase **Settings > JWT Keys**
   bölümünde **Previously used keys** altındaki eski `HS256` anahtarını **More options >
   Revoke** ile kaldırın. Önce yeni dağıtımı doğrulamadan eski anahtarı iptal etmeyin.

`functions/api/delete-account.js`, hesabı silmeden önce Supabase'ten oturumu doğrular.
`SUPABASE_SECRET_KEY` yalnızca bu sunucu tarafı işlemde kullanılır. Finans verisi
Supabase'de kullanıcı hesabına bağlı olarak saklanır ve hesap silinince veritabanı
ilişkisiyle silinir.

## Ücretsiz plan sınırları

- Supabase Free: 500 MB veritabanı, 50.000 aylık aktif kullanıcı; uzun süre etkin olmayan
  proje duraklatılabilir. Ücretsiz e-posta gönderim sınırı düşüktür (varsayılan olarak
  saatte 2 doğrulama/kimlik e-postası).
- Cloudflare Workers Free: Pages Functions çağrıları günlük 100.000 istek ve istek
  başına 10 ms CPU sınırına tabidir. Bu uygulamada Functions yalnızca herkese açık
  yapılandırmayı döndürür ve hesap silme isteğini iletir; statik dosya istekleri ücretsizdir.
- Limitlere ulaşılması uygulamanın yavaşlamasına, isteklerin reddedilmesine veya projenin
  duraklatılmasına neden olabilir. Ücretli yükseltme yapmayın; sağlayıcı panelinde planın
  Free kaldığını kontrol edin.

## Mevcut verileri taşıma

Önce eski çalışan uygulamada **JSON Yedekle** ile finans verilerinizi indirin. Yeni
Cloudflare adresinde yeni bir hesap oluşturup giriş yaptıktan sonra **JSON Geri Yükle**
ile yedeği içe aktarın. Eski sunucudaki hesap/şifreler Supabase'e taşınmaz; yeni hesap
oluşturmanız gerekir. Eski yerel uygulama, yedek alana kadar çalışır durumda kalabilir.

Ücretsiz planda yedekleme ve sürekli erişilebilirlik garantisi yoktur. Düzenli JSON yedeği
alın ve yayımdan önce gizlilik metnini gerçek proje bölgesi ve veri saklama uygulamasına
göre kontrol edin.
