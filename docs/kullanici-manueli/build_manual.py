from pathlib import Path
import re,html,json
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT,TA_CENTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate,PageTemplate,Frame,Paragraph,Spacer,Table,TableStyle,PageBreak,Image,KeepTogether
from reportlab.platypus.tableofcontents import TableOfContents

BASE=Path(__file__).resolve().parent
OUT=BASE
SRC=OUT/'AA-Kaynak-Planlama-Sistemi-Kullanici-Manueli.md'
PDF=OUT/'AA-Kaynak-Planlama-Sistemi-Kullanici-Manueli.pdf'
source_text=SRC.read_text(encoding='utf-8')
header=re.match(r'^---\n(.*?)\n---\n',source_text,re.S)
if header is None:raise ValueError('Manuel üst bilgisi bulunamadı.')
metadata=dict(line.split(': ',1) for line in header.group(1).splitlines() if ': ' in line)
VERSION=metadata['document_version'];DATE=metadata['date'];COMMIT=metadata['baseline_commit'][:7]
import os
font_sets=[
 (Path(os.environ.get('AA_MANUAL_FONT_DIR','fonts')),['Arial.ttf','Arial Bold.ttf','Arial Italic.ttf','Arial Bold Italic.ttf']),
 (Path('/System/Library/Fonts/Supplemental'),['Arial.ttf','Arial Bold.ttf','Arial Italic.ttf','Arial Bold Italic.ttf']),
 (Path(os.environ.get('WINDIR','C:/Windows'))/'Fonts',['arial.ttf','arialbd.ttf','ariali.ttf','arialbi.ttf']),
 (Path('/usr/share/fonts/truetype/dejavu'),['DejaVuSans.ttf','DejaVuSans-Bold.ttf','DejaVuSans-Oblique.ttf','DejaVuSans-BoldOblique.ttf']),
]
selected=next(((directory,files) for directory,files in font_sets if all((directory/f).is_file() for f in files)),None)
if selected is None:raise RuntimeError('Turkce destekli Arial veya DejaVu Sans fontlari bulunamadi. README.md dosyasina bakin.')
FONT,files=selected
for name,file in zip(['Arial','Arial-Bold','Arial-Italic','Arial-BoldItalic'],files):
 pdfmetrics.registerFont(TTFont(name,str(FONT/file)))
pdfmetrics.registerFontFamily('Arial',normal='Arial',bold='Arial-Bold',italic='Arial-Italic',boldItalic='Arial-BoldItalic')
GREEN=colors.HexColor('#354936');DARK=colors.HexColor('#203527');GOLD=colors.HexColor('#a08142');INK=colors.HexColor('#24322c');MUTED=colors.HexColor('#59665e');PALE=colors.HexColor('#f0f4ee');LINE=colors.HexColor('#d6ded3')
W,H=A4; LEFT=50; RIGHT=50; WIDTH=W-LEFT-RIGHT
styles={
 'body':ParagraphStyle('body',fontName='Arial',fontSize=10,leading=14,textColor=INK,spaceAfter=6,splitLongWords=True),
 'h1':ParagraphStyle('h1',fontName='Arial-Bold',fontSize=18.5,leading=23,textColor=DARK,spaceAfter=12,keepWithNext=True),
 'h2':ParagraphStyle('h2',fontName='Arial-Bold',fontSize=11.8,leading=15,textColor=GREEN,spaceBefore=7,spaceAfter=5,keepWithNext=True),
 'cell':ParagraphStyle('cell',fontName='Arial',fontSize=9.1,leading=12.6,textColor=INK,spaceAfter=0,splitLongWords=True),
 'headcell':ParagraphStyle('headcell',fontName='Arial-Bold',fontSize=9.0,leading=12.5,textColor=colors.white,spaceAfter=0,splitLongWords=True),
 'small':ParagraphStyle('small',fontName='Arial-Italic',fontSize=8.5,leading=11.8,textColor=MUTED,spaceAfter=10),
 'note':ParagraphStyle('note',fontName='Arial',fontSize=9.5,leading=14,textColor=DARK,spaceAfter=0),
 'list':ParagraphStyle('list',fontName='Arial',fontSize=10.0,leading=14,textColor=INK,spaceAfter=5,leftIndent=19,firstLineIndent=0,bulletIndent=1),
}

def inline(s):
 s=html.escape(s)
 s=re.sub(r'`([^`]+)`',lambda m:'<font size="8.7" color="#354936">'+m.group(1)+'</font>',s)
 s=re.sub(r'\*\*(.+?)\*\*',r'<b>\1</b>',s)
 return s

def p(s,style='body'):return Paragraph(inline(s),styles[style])

def table(rows):
 n=len(rows[0]);weights=[1]*n
 if n==2:weights=[.34,.66]
 elif n==3:weights=[.18,.40,.42]
 elif n==4:weights=[.34,.22,.22,.22]
 else:weights=[1/n]*n
 if n==2 and rows[0][0] in ('Komut','Bölümler'):weights=[.37,.63]
 if rows[0][0]=='Statü':weights=[.38,.62] if n==2 else [.24,.40,.36]
 if rows[0][0]=='Rapor / grafik':weights=[.52,.48]
 if rows[0][0]=='Kaynaklardaki eski ifade':weights=[.46,.54]
 data=[[p(c,'headcell' if i==0 else 'cell') for c in row] for i,row in enumerate(rows)]
 t=Table(data,colWidths=[WIDTH*w/sum(weights) for w in weights],hAlign='LEFT',repeatRows=1,spaceAfter=12)
 commands=[('BACKGROUND',(0,0),(-1,0),GREEN),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6),('LINEBELOW',(0,0),(-1,0),.7,GOLD),('LINEBELOW',(0,1),(-1,-1),.4,LINE),('LINEBEFORE',(1,1),(-1,-1),.35,LINE)]
 for i in range(1,len(rows)):
  if i%2:commands.append(('BACKGROUND',(0,i),(-1,i),PALE))
 t.setStyle(TableStyle(commands));return t

class ManualDoc(BaseDocTemplate):
 def afterFlowable(self,flowable):
  if hasattr(flowable,'_toc_title'):
   title=flowable._toc_title; key='chapter-'+str(flowable._toc_number)
   self.canv.bookmarkPage(key);self.canv.addOutlineEntry(title,key,0,False)
   self.notify('TOCEntry',(0,title,self.page,key))

def page_art(c,doc):
 if doc.page==1:
  c.setFillColor(DARK);c.rect(0,H-255,W,255,fill=1,stroke=0)
  c.setFillColor(GOLD);c.rect(LEFT-12,110,4,H-425,fill=1,stroke=0)
  c.setFillColor(PALE);c.rect(0,0,W,62,fill=1,stroke=0)
  c.setFont('Arial',8);c.setFillColor(MUTED);c.drawString(LEFT,30,'Son kullanıcılar ve IT ekibi için hazırlanmıştır.')
  return
 c.setStrokeColor(LINE);c.setLineWidth(.5);c.line(LEFT,H-36,W-RIGHT,H-36);c.line(LEFT,36,W-RIGHT,36)
 c.setFillColor(MUTED);c.setFont('Arial',8);c.drawString(LEFT,H-26,'AA Kaynak Planlama Sistemi  |  Kullanıcı Manueli')
 c.drawRightString(W-RIGHT,H-26,'Sürüm '+VERSION+'  /  '+DATE)
 c.setFont('Arial',8);c.drawString(LEFT,23,'Kısa kullanım rehberi  |  Son kullanıcı ve IT')
 c.setFillColor(GREEN);c.drawRightString(W-RIGHT,23,'Sayfa '+str(doc.page))

doc=ManualDoc(str(PDF),pagesize=A4,leftMargin=LEFT,rightMargin=RIGHT,topMargin=54,bottomMargin=50,title='Askeri Araçlar Kaynak Yönetimi Sistemi - Kullanıcı Manueli',author='AA Kaynak Planlama Sistemi',subject='Doğrulanmış Türkçe son kullanıcı ve IT kullanım kılavuzu',pageCompression=1)
doc.addPageTemplates(PageTemplate(id='manual',frames=[Frame(LEFT,50,WIDTH,H-104,id='normal',leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)],onPage=page_art))
cover_title=ParagraphStyle('cover',fontName='Arial-Bold',fontSize=27,leading=35,textColor=colors.white)
cover_kicker=ParagraphStyle('kicker',fontName='Arial',fontSize=11,leading=16,textColor=colors.HexColor('#dce5d6'))
cover_big=ParagraphStyle('big',fontName='Arial-Bold',fontSize=27,leading=35,textColor=DARK)
story=[Spacer(1,20),Paragraph('ASKERİ ARAÇLAR',cover_kicker),Spacer(1,18),Paragraph('Askeri Araçlar<br/>Kaynak Yönetimi<br/>Sistemi',cover_title),Spacer(1,67),Paragraph('Kullanıcı Manueli',cover_big),Spacer(1,10),p('AA Kaynak Planlama Sistemi','small'),Spacer(1,30)]
story+=[table([['Doküman','Bilgi'],['Sürüm / tarih',VERSION+' / '+DATE],['Uygulama paketi',metadata['application_version']+' / '+COMMIT+' kaynakları'],['Hedef kitle','Son kullanıcılar, yöneticiler, Admin ve IT ekibi'],['Doğrulama temeli','Kaynak kod, mevcut belgeler ve sentetik ekran kontrolleri']]),Spacer(1,15),p('Kısa rehber: giriş, kaynak dağılımı, takvim, proje takibi, raporlar ve yetki yönetimi.'),p('Gerçek çalışan verisi, parola veya gizli yapılandırma içermez. IT için başlatma ve kurumda doğrulanacak konular son bölümdedir.','small'),PageBreak()]
story.append(p('İçindekiler','h1'))
toc=TableOfContents();toc.levelStyles=[ParagraphStyle('TOC',fontName='Arial',fontSize=10.2,leading=17.4,textColor=INK,leftIndent=0,firstLineIndent=0,rightIndent=23,spaceBefore=0,spaceAfter=0)]
story.extend([p('Günlük işlemler için 1-6. bölümleri, sorun giderme ve IT notları için 7. bölümü kullanın. Başlıklar ve PDF yer imleri tıklanabilir.','small'),toc,Spacer(1,28),p('Her işlemde: filtreyi kontrol edin, değişikliği yapın ve kaydedilen sonucu doğrulayın.','note'),PageBreak()])
text=source_text[header.end():]
lines=text.splitlines();i=0
while i<len(lines):
 s=lines[i].strip();i+=1
 if not s:continue
 if s=='---page---':story.append(PageBreak());continue
 if s.startswith('# '):
  title=s[2:];h=p(title,'h1');h._toc_title=title;h._toc_number=int(title.split('.')[0]);story.append(h);continue
 if s.startswith('## '):story.append(p(s[3:],'h2'));continue
 if s.startswith('|'):
  rows=[[v.strip() for v in s.strip('|').split('|')]]
  while i<len(lines) and lines[i].strip().startswith('|'):
   row=lines[i].strip();i+=1
   if re.match(r'^\|[\s:|\-]+\|$',row):continue
   rows.append([v.strip() for v in row.strip('|').split('|')])
  story.append(table(rows));continue
 m=re.match(r'!\[(.*?)\]\((.*?)\)',s)
 if m:
  asset=BASE/m.group(2)
  from PIL import Image as PILImage
  w,h=PILImage.open(asset).size
  maxh=250 if Path(m.group(2)).name.startswith('04') else 205
  if Path(m.group(2)).name.startswith('01'):maxh=240
  factor=min(WIDTH/w,maxh/h)
  im=Image(str(asset),width=w*factor,height=h*factor);im.hAlign='CENTER'
  story.append(KeepTogether([Spacer(1,5),im,Spacer(1,5),p(m.group(1)+' Sentetik test ortamı; gerçek kullanıcı verisi içermez.','small')]))
  continue
 if s.startswith('> '):
  t=Table([[p(s[2:],'note')]],colWidths=[WIDTH],spaceBefore=5,spaceAfter=12)
  t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),PALE),('LINEBEFORE',(0,0),(-1,-1),3,GOLD),('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),12),('TOPPADDING',(0,0),(-1,-1),10),('BOTTOMPADDING',(0,0),(-1,-1),10)]));story.append(t);continue
 m=re.match(r'^(\d+)\. (.*)',s)
 if m:story.append(Paragraph(inline(m.group(2)),styles['list'],bulletText=m.group(1)+'.'));continue
 if s.startswith('- '):story.append(Paragraph(inline(s[2:]),styles['list'],bulletText='•'));continue
 if s.startswith('[Ekran görüntüsü eklenecek:'):story.append(p(s,'small'));continue
 paragraph=[s]
 while i<len(lines) and lines[i].strip() and not re.match(r'^(#|\||>|!\[|---page---|\d+\. |- )',lines[i].strip()):paragraph.append(lines[i].strip());i+=1
 story.append(p(' '.join(paragraph)))
doc.multiBuild(story)
print(json.dumps({'pdf':str(PDF),'bytes':PDF.stat().st_size},ensure_ascii=False))
