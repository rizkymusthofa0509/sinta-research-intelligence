// English + Indonesian stopwords, plus academic filler words that are never
// useful as research topics on their own.

const EN = `a about above across after again against all almost also although always am among an and another any are
around as at be because been before being below between both but by can cannot could did do does doing done down during
each either else even ever every few for from further had has have having he her here hers him his how however i if in
into is it its itself just least less like made make many may me might more most much must my neither no nor not now of
off often on once one only onto or other others otherwise our ours out over own per perhaps rather same several shall she
should since so some such than that the their theirs them then there therefore these they this those though through thus
to too toward towards under until up upon us use used uses using very via was we well were what whatever when where
whether which while who whom whose why will with within without would yet you your yours among amongst whereas besides
new two three four five first second third based toward within across regarding namely according especially concerning including`;

const ID = `ada adalah adanya agar akan akhir aku amat anda antar antara apa apabila apakah atas atau bagai bagaimana bagi
bahkan bahwa baik banyak baru beberapa begitu belum benar berada berbagai berdasarkan berikut bersama besar bisa bukan
cara dalam dan dapat dari daripada demikian dengan di dia digunakan diri dimana dua hal hampir hanya harus hingga ia
ialah ini itu jadi jika juga justru kami kamu karena ke kebanyakan kecil kembali kemudian kepada ketika khususnya kita
kurang lagi lain lainnya lalu lebih maka makin mampu mana masih masing melainkan melalui memang memiliki menggunakan
menjadi menurut merupakan mereka meskipun mulai namun oleh pada padahal para pula pun saat saja salah sama sampai
sangat satu saya se sebab sebagai sebagaimana sebelum sebuah secara sedang sedangkan sehingga sejak selain selama
seluruh semua sendiri seperti sering serta setelah setiap sesuai suatu sudah supaya tanpa tapi telah tentang terdapat
terhadap termasuk tersebut tertentu tetapi tiga tidak ujar untuk yaitu yakni yang dilakukan melakukan dilaksanakan
mengetahui diketahui menunjukkan menunjukan diperoleh terjadi bentuk upaya pengaruh hubungan tingkat nilai`;

// Words that describe the paper, not the topic.
const ACADEMIC = `abstract article paper study studies research researcher researchers result results finding findings
method methods methodology approach approaches analysis analyze analyzed analyse aim aims purpose objective objectives
conclusion conclusions discussion introduction review literature data sample samples respondent respondents participant
participants technique techniques process processes effect effects impact role case cases factor factors level levels
significant significantly show shows showed shown indicate indicates indicated found present presents proposed propose
proposes provide provides provided obtained increase increased increasing improve improved improves improvement high
higher low lower better best good important various different several number total overall value values problem problems
issue issues challenge challenges aspect aspects form type types way ways need needs order part parts time year years
term terms including include includes related current future potential possible main major key general specific
effective effectively efficient qualitative quantitative descriptive literature-based therefore thus
penelitian peneliti hasil metode metodologi analisis tujuan kesimpulan pembahasan data sampel responden
teknik proses faktor tingkat signifikan menunjukkan diperoleh meningkatkan peningkatan tinggi rendah baik penting
berbagai jenis masalah permasalahan aspek bagian waktu tahun kajian studi jurnal artikel
kualitatif kuantitatif deskriptif pendekatan menggunakan digunakan penggunaan berbasis terkait saat ini
keyword keywords kata kunci`;

// Frequent English/Indonesian verbs, adverbs and adjectives that are never a topic by themselves.
const COMMON = `regarding namely benefit benefits solution solutions enhance enhancing enhanced explore explores exploring
innovative become becomes becoming considered consider create creates creating created developed develop develops
developing especially according carried carry carrying change changes changing complex comprehensive concern concerns
concept concepts conceptual content context comparative comparison supporting support supports needed outcome outcomes
access production trend trends collaboration assessment compliance creation protection sector sectors
existing emerging growing rapid rapidly significant widely increasingly particularly specifically generally mainly
still need however also able ability abilities achieve achieved achieving addition additional aim aimed allows
applied apply applying assist based benefit beyond build building conducted contribute contributes contribution
describe described design designed determine determined discuss discussed ensure ensuring evaluate evaluated examine
examined expected explain explained focus focused focuses help helps identify identified implement implemented
implementing implementation influence involved involves lead leads make makes making obtain offer offers optimal
perform performed play plays produce produced provide reveal revealed review reviewed seen shape understanding
understand utilize utilized utilization various well-being within world wide`;

// Indonesian fillers that also must not start or end a phrase ("akurasi tertinggi").
const ID_COMMON = `perkembangan pengembangan pemanfaatan penerapan pelaksanaan peran kemampuan kebutuhan keberhasilan kegiatan
memberikan mendukung menghasilkan meningkatnya dilakukannya membantu mengembangkan mengenai merupakan menjadi
positif negatif baru lama tinggi utama umum khusus efektif efisien optimal dunia sebesar tertinggi terendah terbaik mencapai
perbandingan implementasi memprediksi rata-rata rata sehari hari akurasi evaluasi solusi strategi upaya
membandingkan mengidentifikasi menganalisis mengukur menentukan menerapkan meningkatkan menyelesaikan`;

const toSet = (s) => new Set(s.split(/\s+/).filter(Boolean));

export const STOPWORDS = new Set([...toSet(EN), ...toSet(ID)]);
export const ACADEMIC_WORDS = toSet(ACADEMIC);
// Single words too generic to be a bubble on their own (still fine inside phrases).
export const ID_COMMON_WORDS = toSet(ID_COMMON);
export const COMMON_WORDS = new Set([...toSet(COMMON), ...ID_COMMON_WORDS]);
export const GENERIC_UNIGRAMS = new Set([
  ...ACADEMIC_WORDS,
  ...COMMON_WORDS,
  ...toSet(`system systems model models application applications development technology technologies information
  service services management use user users people community society student students teacher teachers learning school
  government company companies business organization human public social life world country indonesia indonesian
  digital modern era usage generated policy-making adoption
  sistem model aplikasi pengembangan teknologi informasi layanan pengelolaan manajemen pengguna masyarakat
  siswa guru sekolah pemerintah perusahaan bisnis organisasi manusia sosial kehidupan dunia negara`),
]);
