import type { RiskSystem } from "./model.ts";

// Initial names from Epic-5-10-2026.xlsx, Sayfa!B2:B76. Seeded only by migration 31.
export const initialRiskSystems: readonly RiskSystem[] = [
  {
    id: "epic_77",
    name: "01500 - SASI CERCEVE SISTEMI",
  },
  {
    id: "epic_76",
    name: "03500 - SUSPANSIYON SISTEMI",
  },
  {
    id: "epic_75",
    name: "05000 - AKSLAR VE SAFTLAR SISTEMI",
  },
  {
    id: "epic_74",
    name: "07000 - DIREKSIYON SISTEMI",
  },
  {
    id: "epic_73",
    name: "08000 - FREN SISTEMI",
  },
  {
    id: "epic_72",
    name: "09000 - HAVA SISTEMI",
  },
  {
    id: "epic_71",
    name: "10000 - URUN LOJISTIK DESTEK SISTEMLERI",
  },
  {
    id: "epic_70",
    name: "11000 - TEKERLEK SISTEMI",
  },
  {
    id: "epic_69",
    name: "11100 - CTIS SISTEMI",
  },
  {
    id: "epic_68",
    name: "11300 - PALET ASKI SISTEMI",
  },
  {
    id: "epic_67",
    name: "12000 - STEPNE ASKI VE BAGLANTILARI SISTEMI",
  },
  {
    id: "epic_66",
    name: "12500 - HIZ AZALTAN SISTEMI",
  },
  {
    id: "epic_65",
    name: "13200 - PERISKOP SISTEMI",
  },
  {
    id: "epic_64",
    name: "14400 - YARDIMCI GUC GRUBU-JENERATOR SISTEMI",
  },
  {
    id: "epic_63",
    name: "16500 - MOTOR SISTEMI",
  },
  {
    id: "epic_62",
    name: "18000 - HAVA EMIS SISTEMI",
  },
  {
    id: "epic_61",
    name: "23000 - VITES SISTEMI",
  },
  {
    id: "epic_60",
    name: "24000 - MEDIKAL EKIPMANLAR SISTEMI",
  },
  {
    id: "epic_59",
    name: "25000 - IC KONUSMA VE TELSIZ HABERLESME SISTEMI",
  },
  {
    id: "epic_58",
    name: "25050 - CEVRESEL FARKINDALIK KAMERA SISTEMI",
  },
  {
    id: "epic_57",
    name: "25100 - SISLEME SISTEMI",
  },
  {
    id: "epic_56",
    name: "25200 - VERİ HABERLEŞME SİSTEMİ",
  },
  {
    id: "epic_55",
    name: "26150 - UZAKTAN KUMANDA SISTEMI",
  },
  {
    id: "epic_54",
    name: "26200 - MÜŞTERİ SİSTEMLERİ MONTAJ ARAYÜZLERİ",
  },
  {
    id: "epic_53",
    name: "26300 - DESTEK AYAKLARI SISTEMI",
  },
  {
    id: "epic_52",
    name: "26700 - KULE SISTEMI",
  },
  {
    id: "epic_2",
    name: "26800 - BEŞİK SISTEMI",
  },
  {
    id: "epic_51",
    name: "28400 - MUSTERI SISTEMLERI",
  },
  {
    id: "epic_50",
    name: "28800 - OTO YANGIN SONDURME&INFILAK BASTIRMA SIS",
  },
  {
    id: "epic_49",
    name: "30300 - ERGONOMIK DESTEKLER",
  },
  {
    id: "epic_48",
    name: "32000 - EGZOZ SISTEMI",
  },
  {
    id: "epic_47",
    name: "33000 - YAKIT SISTEMI",
  },
  {
    id: "epic_46",
    name: "35000 - AVADANLIKLAR VE BAGLANTILARI",
  },
  {
    id: "epic_45",
    name: "35500 - AYDINLATMA SISTEMI",
  },
  {
    id: "epic_44",
    name: "36000 - ELEKTRIK SISTEMI",
  },
  {
    id: "epic_43",
    name: "37000 - TORPIDO SISTEMI",
  },
  {
    id: "epic_42",
    name: "38000 - MOTOR SOGUTMA SISTEMI / SOGUTMA SISTEMI",
  },
  {
    id: "epic_41",
    name: "38550 - BATARYA IKLIMLENDIRME SISTEMI",
  },
  {
    id: "epic_40",
    name: "39000 - ARAC ELEKTRONIK VE KONTROL SISTEMI",
  },
  {
    id: "epic_39",
    name: "39800 - SURUS DESTEK SISTEMLERI",
  },
  {
    id: "epic_38",
    name: "40000 - AMFIBI SISTEM",
  },
  {
    id: "epic_37",
    name: "40800 - SINTINE SISTEMI",
  },
  {
    id: "epic_36",
    name: "41000 - HIDROLIK SOGUTMA SISTEMI",
  },
  {
    id: "epic_35",
    name: "41100 - YARDIMCI HIDROLIK SISTEMLER",
  },
  {
    id: "epic_34",
    name: "46000 - TAHRIK SISTEMI",
  },
  {
    id: "epic_33",
    name: "46500 - YUKSEK GERILIM ELEKTRIK SISTEMI",
  },
  {
    id: "epic_32",
    name: "54000 - CEKME KALDIRMA SISTEMI",
  },
  {
    id: "epic_31",
    name: "55000 - KAPILAR SISTEMI",
  },
  {
    id: "epic_30",
    name: "57000 - KAPAKLAR SISTEMI",
  },
  {
    id: "epic_29",
    name: "57400 - KLAPELER SISTEMI",
  },
  {
    id: "epic_4",
    name: "58750 - EKLENTILER GOVDE",
  },
  {
    id: "epic_28",
    name: "60500 - KAYNAKLI GOVDE",
  },
  {
    id: "epic_1",
    name: "60502 - İŞLENMİŞ GÖVDE",
  },
  {
    id: "epic_27",
    name: "61000 - ASKERI TAKILAR VE SILAH SISTEMLERI",
  },
  {
    id: "epic_26",
    name: "62000 - ZIRH SISTEMI",
  },
  {
    id: "epic_25",
    name: "64000 - BOYALAR VE KORUYUCU MALZEMELER SIST.",
  },
  {
    id: "epic_24",
    name: "64500 - YAGLAR SISTEMI",
  },
  {
    id: "epic_23",
    name: "65000 - ISI VE SES IZOLASYON SISTEMI",
  },
  {
    id: "epic_22",
    name: "66000 - TABAN DOSEME",
  },
  {
    id: "epic_21",
    name: "67000 - CAMLAR SISTEMI",
  },
  {
    id: "epic_20",
    name: "68000 - KOLTUKLAR SISTEMI",
  },
  {
    id: "epic_19",
    name: "70000 - DIS TRIM",
  },
  {
    id: "epic_18",
    name: "71500 - AYNALAR SISTEMI",
  },
  {
    id: "epic_17",
    name: "72000 - IC TRIM",
  },
  {
    id: "epic_16",
    name: "73000 - OZEL EKIPMANLAR SISTEMI",
  },
  {
    id: "epic_15",
    name: "75000 - SILECEKLER ve GORUS TEMIZLEME SISTEMLERI",
  },
  {
    id: "epic_14",
    name: "76000 - KLIMA SISTEMI",
  },
  {
    id: "epic_13",
    name: "76200 - NBC FILTRASYON SISTEMI",
  },
  {
    id: "epic_12",
    name: "76400 - KALORIFER SISTEMI",
  },
  {
    id: "epic_11",
    name: "76750 - TAZE HAVA EMİŞ SİSTEMİ",
  },
  {
    id: "epic_10",
    name: "77050 - ON ISITMA SISTEMI",
  },
  {
    id: "epic_9",
    name: "78000 - TAMPONLAR SISTEMI",
  },
  {
    id: "epic_8",
    name: "79000 - ETIKETLER VE PLAKETLER",
  },
  {
    id: "epic_7",
    name: "90000 - YAZILIM SISTEMI",
  },
  {
    id: "epic_79",
    name: "DİĞER",
  },
];
