using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Persistence.Migrations
{
    public partial class SeedCitiesAndDistricts : Migration
    {
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            var now = new DateTime(2025, 1, 1, 0, 0, 0, DateTimeKind.Utc);

            // ── Cities ────────────────────────────────────────────────────────
            var cityNames = new[]
            {
                /*001*/ "Abasha",            /*002*/ "Abastumani",        /*003*/ "Adigeni",
                /*004*/ "Akhalkalaki",       /*005*/ "Akhaltsikhe",       /*006*/ "Akmeta",
                /*007*/ "Ambrolauri",        /*008*/ "Anaklia",           /*009*/ "Aspindza",
                /*010*/ "Aziskendi",         /*011*/ "Baghdati",          /*012*/ "Bakuriani",
                /*013*/ "Batumi",            /*014*/ "Bolnisi",           /*015*/ "Borjomi",
                /*016*/ "Botanika",          /*017*/ "Chakvi",            /*018*/ "Chiatura",
                /*019*/ "Chkhorotsku",       /*020*/ "Chokhatauri",       /*021*/ "Dedoplistskaro",
                /*022*/ "Dmanisi",           /*023*/ "Dusheti",           /*024*/ "Foladatantkari",
                /*025*/ "Fxvenisi",          /*026*/ "Gamarjveba",        /*027*/ "Gardabani",
                /*028*/ "Gonio",             /*029*/ "Gori",              /*030*/ "Gudauri",
                /*031*/ "Guluxeti",          /*032*/ "Gurjaani",          /*033*/ "Jolevi",
                /*034*/ "Jvari",             /*035*/ "Kareli",            /*036*/ "Karkucha",
                /*037*/ "Kaspi",             /*038*/ "Kazreti",           /*039*/ "Keda",
                /*040*/ "Kharagauli",        /*041*/ "Khashuri",          /*042*/ "Khazbegi",
                /*043*/ "Khelvatchauri",     /*044*/ "Khobi",             /*045*/ "Khoni",
                /*046*/ "Khulo",             /*047*/ "Kisiskhevi",        /*048*/ "Kobuleti",
                /*049*/ "Kulevi",            /*050*/ "Kutaisi",           /*051*/ "Kvareli",
                /*052*/ "Kvariati",          /*053*/ "Kvemo Ponichala",   /*054*/ "Kvishkheti",
                /*055*/ "Kvitiri",           /*056*/ "Lagodekhi",         /*057*/ "Lanchkhuti",
                /*058*/ "Lentekhi",          /*059*/ "Lia",               /*060*/ "Likani",
                /*061*/ "Lisho",             /*062*/ "Lopota",            /*063*/ "Makhinjauri",
                /*064*/ "Manglisi",          /*065*/ "Marneuli",          /*066*/ "Martkopi",
                /*067*/ "Martvili",          /*068*/ "Mestia",            /*069*/ "Mtskheta",
                /*070*/ "Natakhtari",        /*071*/ "Ninoakutxe",        /*072*/ "Ninotsminda",
                /*073*/ "Norio",             /*074*/ "Oni",               /*075*/ "Ozurgeti",
                /*076*/ "Pirveli Persati",   /*077*/ "Poti",              /*078*/ "Rustavi",
                /*079*/ "Sachkhere",         /*080*/ "Sadakhlo",          /*081*/ "Sagarejo",
                /*082*/ "Saguramo",          /*083*/ "Samtredia",         /*084*/ "Sarpi",
                /*085*/ "Sartichala",        /*086*/ "Senaki",            /*087*/ "Sharabidzeebi",
                /*088*/ "Shuakhevi",         /*089*/ "Sighnaghi",         /*090*/ "Stepantsminda",
                /*091*/ "Surami",            /*092*/ "Tbilisi",           /*093*/ "Telavi",
                /*094*/ "Teleti",            /*095*/ "Terjola",           /*096*/ "Tetritskaro",
                /*097*/ "Tianeti",           /*098*/ "Tiniskhidi",        /*099*/ "Tkibuli",
                /*100*/ "Tsageri",           /*101*/ "Tsaishi",           /*102*/ "Tsalenjikha",
                /*103*/ "Tsalka",            /*104*/ "Tsinandali",        /*105*/ "Tsiteli Khidi",
                /*106*/ "Tsiteltskaro",      /*107*/ "Tskaltubo",         /*108*/ "Tsnori",
                /*109*/ "Urbnisi",           /*110*/ "Ureki",             /*111*/ "Vale",
                /*112*/ "Vani",              /*113*/ "Vashlara",          /*114*/ "Vaziani",
                /*115*/ "Zemo Ponichala",    /*116*/ "Zestafoni",         /*117*/ "Zugdidi",
            };

            var cityIds = cityNames.Select(_ => Guid.NewGuid()).ToArray();

            for (int i = 0; i < cityNames.Length; i++)
            {
                migrationBuilder.InsertData(
                    table: "Cities",
                    columns: new[] { "Id", "CityName", "CreatedAt", "DateDeleted" },
                    values: new object[] { cityIds[i], cityNames[i], now, null });
            }

            // ── Districts ─────────────────────────────────────────────────────
            // CityIdx is 1-based, matching the city comments above.
            var districts = new (int CityIdx, string Name)[]
            {
                // 01 Abasha
                (1,"Dzveli Abasha"),(1,"Etseri"),(1,"Gagma Zanati"),(1,"Gautskhinari"),
                (1,"Gezati"),(1,"Guleikari"),(1,"Ketilari"),(1,"Kodori"),
                (1,"Macxovriskari"),(1,"Maidani"),(1,"Marani"),(1,"Naesakovo"),
                (1,"Norio"),(1,"Ontopo"),(1,"Pirveli Maisi"),(1,"Qolobani"),
                (1,"Sagvazao"),(1,"Samiqao"),(1,"Sepieti"),(1,"Sujuna"),
                (1,"Tkhviri"),(1,"Txmelari"),(1,"Wyemi"),(1,"Zanati"),

                // 02 Abastumani
                (2,"Kharjami"),(2,"Naqurdevi"),(2,"Sagrdze"),(2,"Varxani"),

                // 03 Adigeni
                (3,"Arali"),(3,"Arzne"),(3,"Berana"),(3,"Bolajuri"),(3,"Chechla"),
                (3,"Cixisubani"),(3,"Derceli"),(3,"Flate"),(3,"Gomaro"),(3,"Imertubani"),
                (3,"Kaxareti"),(3,"Kexovani"),(3,"Kvemo Enteli"),(3,"Lelovani"),
                (3,"Mlashe"),(3,"Moxe"),(3,"Naminauri"),(3,"Qiqineti"),(3,"Smada"),
                (3,"Tsre"),(3,"Ude"),(3,"Unwa"),(3,"Waxani"),(3,"Xevasheni"),
                (3,"Zanavi"),(3,"Zarzma"),

                // 04 Akhalkalaki
                (4,"Agana"),(4,"Aragva"),(4,"Azmana"),(4,"Baraleti"),(4,"Bejano"),
                (4,"Burnasheti"),(4,"Chunchxa"),(4,"Gogasheni"),(4,"Kartsakhi"),
                (4,"Khartsepi"),(4,"Kirovakani"),(4,"Kotelia"),(4,"Okami"),
                (4,"Ptena"),(4,"Sulda"),(4,"Turcxi"),(4,"Xospio"),(4,"Xulgumo"),

                // 05 Akhaltsikhe
                (5,"Abathkhevi"),(5,"Agara"),(5,"Akhalsheni"),(5,"Anda"),
                (5,"Andriawminda"),(5,"Ani"),(5,"Awyuri"),(5,"Boga"),(5,"Chacharakhi"),
                (5,"Chvinta"),(5,"Giorgitsminda"),(5,"Greli"),(5,"Klde"),(5,"Minadze"),
                (5,"Mugareti"),(5,"Musxi"),(5,"Sayuneti"),(5,"Sviri"),(5,"Sxvilisi"),
                (5,"Tyemlana"),(5,"Uraveli"),(5,"Wnisi"),(5,"Wyirdza"),(5,"Xeoti"),
                (5,"Zikilia"),

                // 06 Akmeta
                (6,"Akhshani"),(6,"Arashenda"),(6,"Argoxi"),(6,"Awyuri"),(6,"Axalsheni"),
                (6,"Babaneuri"),(6,"Birkiani"),(6,"Chabinaani"),(6,"Duisi"),(6,"Dumasturi"),
                (6,"Joyolo"),(6,"Khorkheli"),(6,"Koghoto"),(6,"Kogoto"),(6,"Magraani"),
                (6,"Matani"),(6,"Ojio"),(6,"Omalo"),(6,"Pankisi"),(6,"Pichkhovani"),
                (6,"Qistauri"),(6,"Qoreti"),(6,"Qvemo Alvani"),(6,"Sakobiano"),
                (6,"Winubani"),(6,"Yvarelwyali"),(6,"Zemo Alvani"),(6,"Zemo Xodasheni"),

                // 07 Ambrolauri
                (7,"Agara"),(7,"Bostana"),(7,"Bugeuli"),(7,"Caxi"),(7,"Cheliagele"),
                (7,"Chorjo"),(7,"Chrebalo"),(7,"Chyvishi"),(7,"Dzirageuli"),(7,"Gviara"),
                (7,"Jvarisa"),(7,"Khimshi"),(7,"Khotevi"),(7,"Krixi"),(7,"Lixeti"),
                (7,"Meore Tola"),(7,"Nakva"),(7,"Nikorwminda"),(7,"Patara Oni"),
                (7,"Qvemo Krixi"),(7,"Qvishari"),(7,"Sadmeli"),(7,"Saketsia"),
                (7,"Tlugi"),(7,"Uravi"),(7,"Uyeshi"),(7,"Wesi"),(7,"Xvanchkara"),

                // 09 Aspindza
                (9,"Awyvita"),(9,"Chobareti"),(9,"Dzveli"),(9,"Fia"),(9,"Gelsunda"),
                (9,"Iveria"),(9,"Naqalaqevi"),(9,"Nijgori"),(9,"Oshora"),(9,"Ota"),
                (9,"Rustavi"),(9,"Saxudabeli"),(9,"Sayudabeli"),(9,"Tmogvi"),
                (9,"Toloshi"),(9,"Vardzia"),(9,"Xertvisi"),(9,"Xizabavra"),

                // 11 Baghdati
                (11,"Dapenili"),(11,"Didvela"),(11,"Dimi"),(11,"Fersati"),
                (11,"Meore Obcha"),(11,"Nergeeti"),(11,"Obcha"),(11,"Pirveli Obcha"),
                (11,"Qveda Dimi"),(11,"Rokiti"),(11,"Roxi"),(11,"Saimedo"),
                (11,"Shubani"),(11,"Varcixe"),(11,"Witelxevi"),(11,"Zeda Dimi"),
                (11,"Zegani"),

                // 12 Bakuriani
                (12,"Andeziti"),(12,"Cemi"),(12,"Cixisdziri"),(12,"Mzetamze"),
                (12,"Tba"),(12,"Timotes Ubani"),(12,"Tsaghveri"),

                // 13 Batumi
                (13,"Achariswkali"),

                // 14 Bolnisi
                (14,"Balichi"),(14,"Bolnisi"),(14,"Disveli"),(14,"Kianeti"),
                (14,"Naxiduri"),(14,"Qvemo"),(14,"Qveshi"),(14,"Rachisubani"),
                (14,"Ratevani"),(14,"Talaveri"),(14,"Tamarisi"),(14,"Tandzia"),
                (14,"Tsurtaveli"),(14,"Xatisopeli"),(14,"Zemo Arqevani"),

                // 15 Borjomi
                (15,"Akhaldaba"),(15,"Chobisxevi"),(15,"Daba"),(15,"Didi Mitarbi"),
                (15,"Dviri"),(15,"Kortaneti"),(15,"Qvabisxevi"),(15,"Rveli"),
                (15,"Sadgeri"),(15,"Sakire"),(15,"Tadzrisi"),(15,"Tsixisjvari"),
                (15,"Yvibisi"),(15,"Zanavi"),

                // 18 Chiatura
                (18,"Darkveti"),(18,"Didi Kacxi"),(18,"Gezrula"),(18,"Gundaeti"),
                (18,"Itxvisi"),(18,"Kalauri"),(18,"Mandaeti"),(18,"Merevi"),
                (18,"Mgvimevi"),(18,"Mordzgveti"),(18,"Navardzeti"),(18,"Nigozeti"),
                (18,"Perevisa"),(18,"Qvacixe"),(18,"Rcxilati"),(18,"Rgani"),
                (18,"Shuqruti"),(18,"Skindori"),(18,"Sveri"),(18,"Tabagrebi"),
                (18,"Tskhrukveti"),(18,"Tvalueti"),(18,"Tyemlovana"),(18,"Usaxelo"),
                (18,"Wasri"),(18,"Winsofeli"),(18,"Wirqvali"),(18,"Wyalshavi"),
                (18,"Xalifauri"),(18,"Xreiti"),(18,"Zeda Beretisa"),(18,"Zeda Chalovani"),
                (18,"Zodi"),

                // 19 Chkhorotsku
                (19,"Axuti"),(19,"Jumiti"),(19,"Khantski"),(19,"Kircxi"),
                (19,"Ledarsale"),(19,"Lesichine"),(19,"Lewurwume"),(19,"Meore Choga"),
                (19,"Muxuri"),(19,"Nafichxu"),(19,"Otskhomuri"),(19,"Pirveli Choga"),
                (19,"Saraqoni"),(19,"Taia"),(19,"Xabume"),(19,"Zumi"),

                // 20 Chokhatauri
                (20,"Amagleba"),(20,"Axalsheni"),(20,"Basileti"),(20,"Bukiscixe"),
                (20,"Buknari"),(20,"Buqsieti"),(20,"Burnati"),(20,"Dablacixe"),
                (20,"Djvarcxma"),(20,"Erketi"),(20,"Gogolesubani"),(20,"Goraberejouli"),
                (20,"Guturi"),(20,"Ianeuli"),(20,"Khevi"),(20,"Koxnari"),
                (20,"Nabeglavi"),(20,"Qvenobani"),(20,"Sachamiaseri"),(20,"Sameba"),
                (20,"Shua Surebi"),(20,"Sua Amagleba"),(20,"Sua Farcxma"),(20,"Wifnara"),
                (20,"Xidistavi"),(20,"Zomleti"),

                // 21 Dedoplistskaro
                (21,"Arboshiki"),(21,"Arxiloskaro"),(21,"Choeti"),(21,"Firosmani"),
                (21,"Gamarjveba"),(21,"Jafaridze"),(21,"Mirzaani"),(21,"Ozaani"),
                (21,"Qvemo Qedi"),(21,"Sabathlo"),(21,"Samreklo"),(21,"Samtawyaro"),
                (21,"Xornabuji"),(21,"Zemo Machkhaani"),(21,"Zemo Qedi"),

                // 22 Dmanisi
                (22,"Amamlo"),(22,"Boslebi"),(22,"Didi Dmanisi"),(22,"Gantiadi"),
                (22,"Gomareti"),(22,"Javaxi"),(22,"Mashavera"),(22,"Sarkineti"),
                (22,"Tnusi"),

                // 23 Dusheti
                (23,"Abanosxevi"),(23,"Ananuri"),(23,"Aragvispiri"),(23,"Aranisi"),
                (23,"Araxveti"),(23,"Axatani"),(23,"Baga"),(23,"Barisaxo"),
                (23,"Bazaleti"),(23,"Bedoni"),(23,"Bodorna"),(23,"Bulachauri"),
                (23,"Chanadirtkari"),(23,"Chargali"),(23,"Chartali"),(23,"Chinti"),
                (23,"Choporti"),(23,"Civwyaro"),(23,"Fasanauri"),(23,"Gomewari"),
                (23,"Gremisxevi"),(23,"Gudani"),(23,"Jinvali"),(23,"Kanatia"),
                (23,"Katsalkhevi"),(23,"Kharkheti"),(23,"Kobiaant Kari"),(23,"Korsha"),
                (23,"Lafanaantkari"),(23,"Lakatkhevi"),(23,"Magaroskari"),(23,"Mchadijvari"),
                (23,"Meneso"),(23,"Mlashe"),(23,"Muguda"),(23,"Nadibaani"),
                (23,"Naghvarevi"),(23,"Odzisi"),(23,"Qalilo"),(23,"Qubriaantkari"),
                (23,"Qvemo Mleta"),(23,"Qvesheti"),(23,"Sefe"),(23,"Shuafxo"),
                (23,"Tkhiliana"),(23,"Tvalivi"),(23,"Witelsofeli"),(23,"Wiwamura"),
                (23,"Yvavili"),(23,"Zemo Amirni"),

                // 27 Gardabani
                (27,"Agtaklia"),(27,"Axali Samgori"),(27,"Axalsopeli"),(27,"Broweula"),
                (27,"Gachiani"),(27,"Krwanisi"),(27,"Kumisi"),(27,"Lamshveniera"),
                (27,"Mtiadziri"),(27,"Mzianeti"),(27,"Nagebi"),(27,"Nazarlo"),
                (27,"Qesalo"),(27,"Qvemo Teleti"),(27,"Saakadze"),(27,"Sacxenisi"),
                (27,"Sartskhenisi"),(27,"Vaxtangisi"),(27,"Walasyuri"),(27,"Yarajalari"),

                // 29 Gori
                (29,"Adzvi"),(29,"Arbo"),(29,"Ateni"),(29,"Axaldaba"),(29,"Axalsheni"),
                (29,"Axalsopeli"),(29,"Axalubani"),(29,"Axrisi"),(29,"Berbuki"),
                (29,"Bershueti"),(29,"Betlemi"),(29,"Bnavisi"),(29,"Browleti"),
                (29,"Dici"),(29,"Didi Garejvari"),(29,"Dzevera"),(29,"Ergneti"),
                (29,"Flavi"),(29,"Flavismani"),(29,"Fxvenisi"),(29,"Karaleti"),
                (29,"Karbi"),(29,"Kirbali"),(29,"Marana"),(29,"Megvresiki"),
                (29,"Mejvrisxevi"),(29,"Mereti"),(29,"Nadarbazevi"),(29,"Nawreti"),
                (29,"Niqozi"),(29,"Ortasheni"),(29,"Patara Garejvari"),(29,"Qere"),
                (29,"Qiwnisi"),(29,"Qordi"),(29,"Qvaxvreli"),(29,"Qvemo Arcevi"),
                (29,"Qvemo Axalsopeli"),(29,"Qvemo Niqozi"),(29,"Qvemo Xviti"),
                (29,"Qveshi"),(29,"Rexa"),(29,"Rieti"),(29,"Saqasheti"),(29,"Satemo"),
                (29,"Seturni"),(29,"Shavshebi"),(29,"Shertuli"),(29,"Shindisi"),
                (29,"Skra"),(29,"Sobisi"),(29,"Sveneti"),(29,"Tedowminda"),
                (29,"Tinisxidi"),(29,"Tirdznisi"),(29,"Tortiza"),(29,"Tsitsagiantkari"),
                (29,"Tyviavi"),(29,"Upliscixe"),(29,"Variani"),(29,"Wedisi"),
                (29,"Witelubani"),(29,"Xeltubani"),(29,"Xidistavi"),(29,"Yelqceuli"),
                (29,"Zemo Niqozi"),(29,"Zemo Xviti"),(29,"Zerti"),(29,"Zugduleti"),

                // 32 Gurjaani
                (32,"Arashenda"),(32,"Axasheni"),(32,"Bakurcixe"),(32,"Chalaubani"),
                (32,"Chandari"),(32,"Chumlayi"),(32,"Darcheti"),(32,"Dzirkoki"),
                (32,"Gurjaani"),(32,"Jimiti"),(32,"Kachreti"),(32,"Kakhifari"),
                (32,"Kalauri"),(32,"Kardenaxi"),(32,"Kolagi"),(32,"Melaani"),
                (32,"Mukuzani"),(32,"Naniani"),(32,"Qodalo"),(32,"Shashiani"),
                (32,"Vachnadzeani"),(32,"Vachnadziani"),(32,"Vazisubani"),(32,"Vedjini"),
                (32,"Veliscixe"),(32,"Yitaani"),(32,"Zegaani"),

                // 35 Kareli
                (35,"Abano"),(35,"Abisi"),(35,"Arabeti"),(35,"Aradeti"),(35,"Avlevi"),
                (35,"Axalsofeli"),(35,"Bebnisi"),(35,"Berdzenauli"),(35,"Bredza"),
                (35,"Breti"),(35,"Ceronisi"),(35,"Chandrebi"),(35,"Daba Agara"),
                (35,"Dirbi"),(35,"Dvani"),(35,"Dzlividjvari"),(35,"Fca"),(35,"Gogeti"),
                (35,"Kexijvari"),(35,"Knolevi"),(35,"Kvemo Khvedureti"),(35,"Moxisi"),
                (35,"Ortubani"),(35,"Qvenatkoca"),(35,"Ruisi"),(35,"Sacixuri"),
                (35,"Sagolasheni"),(35,"Samwevrisi"),(35,"Sanebeli"),(35,"Sasireti"),
                (35,"Tamarasheni"),(35,"Taxtisdziri"),(35,"Urbnisi"),(35,"Vedreba"),
                (35,"Wveri"),(35,"Yinwvisi"),(35,"Zemo Xvedureti"),(35,"Zguderi"),

                // 37 Kaspi
                (37,"Aghaiani"),(37,"Akhalkhalakhi"),(37,"Akhaltsikhe"),(37,"Barnabiantkari"),
                (37,"Bojami"),(37,"Chobalauri"),(37,"Doesi"),(37,"Gariyula"),
                (37,"Grakali"),(37,"Igoeti"),(37,"Kavtiskhevi"),(37,"Khidiskuri"),
                (37,"Khovle"),(37,"Kodistskaro"),(37,"Lamisyana"),(37,"Metekhi"),
                (37,"Mikeltskaro"),(37,"Mrgvali Chala"),(37,"Niabi"),(37,"Noste"),
                (37,"Okami"),(37,"Perma"),(37,"Qvemo Chala"),(37,"Qvemo Gomi"),
                (37,"Rene"),(37,"Samtavisi"),(37,"Saqadagiano"),(37,"Sasireti"),
                (37,"Telatgori"),(37,"Teliani"),(37,"Tezi"),(37,"Tsinarekhi"),
                (37,"Tvaladi"),(37,"Zemo Chocheti"),(37,"Zemo Khandaki"),

                // 39 Keda
                (39,"Abuqeta"),(39,"Aguta"),(39,"Chetkidzeebi"),(39,"Cxmorisi"),
                (39,"Dandalo"),(39,"Dologani"),(39,"Dzenwmani"),(39,"Gegelidzeebi"),
                (39,"Kokotauri"),(39,"Koromxeti"),(39,"Maradidi"),(39,"Maxunceti"),
                (39,"Medzibna"),(39,"Merisi"),(39,"Qveda Bzubzu"),(39,"Qveda Maxunceti"),
                (39,"Tsoniarisi"),(39,"Uchkhiri"),(39,"Vaio"),(39,"Zeda Bzubzu"),

                // 40 Kharagauli
                (40,"Axalsofeli"),(40,"Boriti"),(40,"Chrdili"),(40,"Chxeri"),
                (40,"Didvake"),(40,"Farcxnali"),(40,"Gedsamania"),(40,"Goresha"),
                (40,"Kicxi"),(40,"Lashe"),(40,"Laxundara"),(40,"Legvani"),
                (40,"Maqatubani"),(40,"Marelisi"),(40,"Nadakhuri"),(40,"Sagandzile"),
                (40,"Saqariaqedi"),(40,"Saqasria"),(40,"Tetriwyaro"),(40,"Tsitskiuri"),
                (40,"Ubisa"),(40,"Vani"),(40,"Vardzia"),(40,"Vertyichala"),
                (40,"Waqva"),(40,"Xevi"),(40,"Xidari"),(40,"Xunevi"),

                // 41 Khashuri
                (41,"Ali"),(41,"Bekami"),(41,"Brili"),(41,"Chumateleti"),(41,"Cocxnari"),
                (41,"Cxramuxa"),(41,"Daba Agara"),(41,"Didi Flevi"),(41,"Flevi"),
                (41,"Gomi"),(41,"Mitsobi"),(41,"Nabaxtevi"),(41,"Nacargora"),
                (41,"Osiauri"),(41,"Patara Bekami"),(41,"Qemferi"),(41,"Qindzati"),
                (41,"Qvemo Osiauri"),(41,"Qvishxeti"),(41,"Sative"),(41,"Tashiskari"),
                (41,"Terezi"),(41,"Tkoca"),(41,"Vaya"),(41,"Wromi"),(41,"Xcisi"),
                (41,"Zemo Osiauri"),

                // 42 Khazbegi
                (42,"Arma"),(42,"Fansheti"),(42,"Fxelshe"),(42,"Tansheti"),
                (42,"Tyarsheti"),(42,"Yanobi"),

                // 43 Khelvatchauri
                (43,"Axalsheni"),(43,"Axalsofeli"),(43,"Charnali"),(43,"Chelta"),
                (43,"Erge"),(43,"Feria"),(43,"Gantiadi"),(43,"Kapandidi"),
                (43,"Kapreshumi"),(43,"Kirnati"),(43,"Machaxlispiri"),(43,"Maxo"),
                (43,"Ortabatumi"),(43,"Qedqedi"),(43,"Qveda Sameba"),(43,"Salibauri"),
                (43,"Satexia"),(43,"Sharabidzeebi"),(43,"Tsxemlara"),(43,"Txilnari"),
                (43,"Winsvla"),(43,"Yorolistavi"),(43,"Zeda Djocho"),(43,"Zeda Txilnari"),

                // 44 Khobi
                (44,"Axali Xibula"),(44,"Axalsofeli"),(44,"Bia"),(44,"Chaladidi"),
                (44,"Gagma Qariata"),(44,"Japshaqari"),(44,"Khadijava"),(44,"Khamiskuri"),
                (44,"Meore Guripuli"),(44,"Nodjixevi"),(44,"Patara Xorga"),
                (44,"Pirveli Maisi"),(44,"Qariata"),(44,"Qvemo Qvaloni"),(44,"Sadjidjao"),
                (44,"Sagvichio"),(44,"Shua Qvaloni"),(44,"Shua Xorga"),(44,"Torsa"),
                (44,"Xeta"),(44,"Zemo Chaladidi"),(44,"Zemo Qvaloni"),

                // 45 Khoni
                (45,"Axalsheni"),(45,"Dedalauri"),(45,"Didi Gubi"),(45,"Didi Kuxi"),
                (45,"Gochajikhaishi"),(45,"Gordi"),(45,"Gubi"),(45,"Ivandidi"),
                (45,"Kontuati"),(45,"Matxodji"),(45,"Naxaxulevi"),(45,"Patara Djixaishi"),
                (45,"Patara Kuxi"),(45,"Qutiri"),(45,"Sawulukidzeo"),(45,"Xidi"),

                // 46 Khulo
                (46,"Chao"),(46,"Dekanashvilebi"),(46,"Didachara"),(46,"Dzirkvadzeebi"),
                (46,"Fachxa"),(46,"Ganaxleba"),(46,"Geladzeebi"),(46,"Gordjomi"),
                (46,"Iakobidzeebi"),(46,"Iremadzeebi"),(46,"Kortoxi"),(46,"Maniaketi"),
                (46,"Paqsadzeebi"),(46,"Riyeti"),(46,"Vashlovani"),(46,"Xixadziri"),

                // 48 Kobuleti
                (48,"Achyvistavi"),(48,"Alambari"),(48,"Awhyvistavi"),(48,"Boboyvati"),
                (48,"Buknari"),(48,"Cecxlauri"),(48,"Chaisubani"),(48,"Chaxati"),
                (48,"Cixisdziri"),(48,"Dagva"),(48,"Djixandjuri"),(48,"Gelauri"),
                (48,"Gorgadzeebi"),(48,"Gvara"),(48,"Kakuti"),(48,"Kobuleti"),
                (48,"Koxi"),(48,"Kveda Sameba"),(48,"Kvirike"),(48,"Legva"),
                (48,"Muxaestate"),(48,"Nakaidzeebi"),(48,"Ochxamuri"),(48,"Qveda Achyva"),
                (48,"Qveda Kvirike"),(48,"Sachino"),(48,"Saxalvasho"),(48,"Shuagele"),
                (48,"Wyavroka"),(48,"Xala"),(48,"Xucubani"),(48,"Zeda Achyva"),
                (48,"Zeda Sameba"),(48,"Zeniti"),

                // 50 Kutaisi
                (50,"Brotseula"),(50,"Chognari"),(50,"Godogani"),
                (50,"Kopitnari"),(50,"Sagoria"),

                // 51 Kvareli
                (51,"Almati"),(51,"Axalsofeli"),(51,"Balgodjiani"),(51,"Chikaani"),
                (51,"Eniseli"),(51,"Gavazi"),(51,"Gremi"),(51,"Kuchatani"),
                (51,"Mtisdziri"),(51,"Sabue"),(51,"Sanavardo"),(51,"Shaqriani"),
                (51,"Shilda"),(51,"Tivi"),(51,"Wiwkanaantseri"),(51,"Zinobiani"),

                // 56 Lagodekhi
                (56,"Afeni"),(56,"Areshferani"),(56,"Baghdati"),(56,"Baisubani"),
                (56,"Bolokiani"),(56,"Chabukiani"),(56,"Chaduniani"),(56,"Chiauri"),
                (56,"Codniskari"),(56,"Davitiani"),(56,"Fona"),(56,"Ganatleba"),
                (56,"Gelati"),(56,"Giorgeti"),(56,"Gurgeniani"),(56,"Gvimriani"),
                (56,"Heretiskari"),(56,"Kabali"),(56,"Kartubani"),(56,"Kavshiri"),
                (56,"Lafniani"),(56,"Leliani"),(56,"Matsimi"),(56,"Mshvidobiani"),
                (56,"Mskhalgori"),(56,"Natsisqvilari"),(56,"Ninigori"),(56,"Onanauri"),
                (56,"Patara Gori"),(56,"Qartubani"),(56,"Qvemo Gurgeniani"),(56,"Saqobo"),
                (56,"Sheerteba"),(56,"Shroma"),(56,"Tamariani"),(56,"Tela"),
                (56,"Tsiflistskaro"),(56,"Vardisubani"),(56,"Zemo Nashovari"),

                // 57 Lanchkhuti
                (57,"Acana"),(57,"Akhalsopeli"),(57,"Archeuli"),(57,"Chancheti"),
                (57,"Chibati"),(57,"Chkonagora"),(57,"Chochkhati"),(57,"Etseri"),
                (57,"Ghrmaghele"),(57,"Grigoleti"),(57,"Guliani"),(57,"Gvimbalauri"),
                (57,"Japana"),(57,"Jikhanjiri"),(57,"Juneweri"),(57,"Juruyveti"),
                (57,"Khajalia"),(57,"Lesa"),(57,"Machkhvareti"),(57,"Mamati"),
                (57,"Nigoiti"),(57,"Nigvziani"),(57,"Ninoshvili"),(57,"Ormeti"),
                (57,"Qvemo Chibati"),(57,"Qviani"),(57,"Shukhuti"),(57,"Sufsa"),
                (57,"Tskaltsminda"),(57,"Yvavilnari"),(57,"Zemo Shukhuti"),

                // 58 Lentekhi
                (58,"Babili"),(58,"Kheledi"),(58,"Khofuri"),(58,"Lamanashuri"),
                (58,"Leqsura"),(58,"Lesema"),(58,"Rckhmeluri"),

                // 65 Marneuli
                (65,"Akhali Dioknisi"),(65,"Algeti"),(65,"Damia"),(65,"Khikhani"),
                (65,"Khojorni"),(65,"Maradisi"),(65,"Qirach-Mughanlo"),(65,"Sadakhlo"),
                (65,"Saimerlo"),(65,"Shaumiani"),(65,"Shulaveri"),(65,"Sioni"),
                (65,"Tamarisi"),(65,"Tseraqvi"),(65,"Tsereteli"),(65,"Yizilajlu"),
                (65,"Zemo Sarali"),

                // 67 Martvili
                (67,"Abedati"),(67,"Abgisi"),(67,"Balda"),(67,"Bandza"),
                (67,"Didi Chyoni"),(67,"Didi Inchkhuri"),(67,"Doberazeni"),(67,"Gachedili"),
                (67,"Inchkhuri"),(67,"Khuntsi"),(67,"Kitsia"),(67,"Kurzu"),
                (67,"Kveda Nagvazao"),(67,"Lekhaindrao"),(67,"Muxurcha"),(67,"Najakhao"),
                (67,"Nakhunao"),(67,"Nakhurtsilavo"),(67,"Nogha"),(67,"Onoghia"),
                (67,"Patara Ichxuri"),(67,"Pirveli Gurdzemi"),(67,"Salkhino"),
                (67,"Sergieti"),(67,"Taleri"),(67,"Tamakoni"),(67,"Vedidkari"),
                (67,"Zemo Nagvazao"),

                // 68 Mestia
                (68,"Barjashi"),(68,"Becho"),(68,"Dizi"),(68,"Eceri"),(68,"Jorkvali"),
                (68,"Khaishi"),(68,"Lakhamula"),(68,"Latali"),(68,"Lenjeri"),
                (68,"Lukhi"),(68,"Mazeri"),(68,"Tchuberi"),

                // 69 Mtskheta
                (69,"Aghdgomliantkari"),(69,"Akhaldaba"),(69,"Akhali Nichbisi"),
                (69,"Akhalsopeli"),(69,"Akhalubani"),(69,"Arashenda"),(69,"Armazi"),
                (69,"Bitsmendi"),(69,"Chardakhi"),(69,"Cikhisdziri"),(69,"Dzalisi"),
                (69,"Dzegvi"),(69,"Dzveli Qanda"),(69,"Ereda"),(69,"Frezeti"),
                (69,"Galavani"),(69,"Gorovani"),(69,"Jighaura"),(69,"Lisi"),
                (69,"Misaqcieli"),(69,"Mukhrani"),(69,"Natakhtari"),(69,"Navazi"),
                (69,"Navdaraant Kari"),(69,"Nichbisi"),(69,"Patara Qanda"),(69,"Qsani"),
                (69,"Qsovrisi"),(69,"Qvemo Nichbisi"),(69,"Saguramo"),(69,"Shankevani"),
                (69,"Tserovani"),(69,"Tsilkani"),(69,"Tsinamdzghvriantkari"),
                (69,"Tsitsamuri"),(69,"Vaziani"),(69,"Zaqaro"),(69,"Zemo Nichbisi"),

                // 72 Ninotsminda
                (72,"Didi Gondura"),(72,"Didi Khanchali"),(72,"Efremovka"),(72,"Foka"),
                (72,"Gandza"),(72,"Gorelovka"),(72,"Jigrasheni"),(72,"Orlovka"),
                (72,"Sameba"),(72,"Spasovka"),(72,"Zhdanovi"),

                // 74 Oni
                (74,"Ghari"),(74,"Lachta"),(74,"Nigazevri"),(74,"Sori"),(74,"Utsera"),

                // 75 Ozurgeti
                (75,"Achi"),(75,"Askana"),(75,"Baghdadi"),(75,"Baileti"),(75,"Bakhvi"),
                (75,"Bokhvauri"),(75,"Chanieti"),(75,"Cikhisferdi"),(75,"Ckhemliskhidi"),
                (75,"Dvabzu"),(75,"Dzimiti"),(75,"Famfaleti"),(75,"Gaghma Dvabzu"),
                (75,"Gurianta"),(75,"Jumati"),(75,"Khvarbeti"),(75,"Konchkati"),
                (75,"Kvemo Natanebi"),(75,"Laituri"),(75,"Likhauri"),(75,"Makvaneti"),
                (75,"Meleqeduri"),(75,"Meria"),(75,"Mshvidobauri"),(75,"Mtispiri"),
                (75,"Mziani"),(75,"Naghobilevi"),(75,"Nagomari"),(75,"Naruja"),
                (75,"Nasakirali"),(75,"Natanebi"),(75,"Okroskedi"),(75,"Ozurgeti"),
                (75,"Qveda Bakhvi"),(75,"Shekvetili"),(75,"Shemoqmedi"),(75,"Shroma"),
                (75,"Silauri"),(75,"Tkhinvali"),(75,"Vakijvari"),(75,"Witelmta"),
                (75,"Wvermaghala"),(75,"Zemo Natanebi"),

                // 77 Poti
                (77,"Patara Foti"),(77,"Shavgele"),

                // 79 Sachkhere
                (79,"Argveti"),(79,"Chala"),(79,"Chalovani"),(79,"Chixa"),
                (79,"Chorvila"),(79,"Darkha"),(79,"Gamogma Argveti"),(79,"Gorisa"),
                (79,"Icqisi"),(79,"Itavaza"),(79,"Ivanwminda"),(79,"Jalaurta"),
                (79,"Jria"),(79,"Kalvata"),(79,"Korbouli"),(79,"Maxatauri"),
                (79,"Merjevi"),(79,"Modzvi"),(79,"Nigvzara"),(79,"Orguli"),
                (79,"Perevi"),(79,"Qoreti"),(79,"Qveda Orguli"),(79,"Sairxe"),
                (79,"Sareki"),(79,"Savane"),(79,"Shalauri"),(79,"Shomaxeti"),
                (79,"Speti"),(79,"Sxvitori"),

                // 81 Sagarejo
                (81,"Badiauri"),(81,"Didi Chailuri"),(81,"Giorgiwminda"),(81,"Gombori"),
                (81,"Iormuganlo"),(81,"Kakabeti"),(81,"Kochbani"),(81,"Manavi"),
                (81,"Mzisguli"),(81,"Ninotsminda"),(81,"Ninowminda"),(81,"Patara Chaialuri"),
                (81,"Patardzeuli"),(81,"Shibliani"),(81,"Tokhliauri"),(81,"Udabno"),
                (81,"Ujarma"),(81,"Verxviani"),(81,"Wyarostavi"),(81,"Xashmi"),
                (81,"Yandaura"),

                // 83 Samtredia
                (83,"Axalsofeli"),(83,"Bashi"),(83,"Chagani"),(83,"Chognari"),
                (83,"Chxenishi"),(83,"Daba Kulashi"),(83,"Dafnari"),(83,"Didi Chkoni"),
                (83,"Didi Jixaishi"),(83,"Eweri"),(83,"Ganiri"),(83,"Gomi"),
                (83,"Gormaghali"),(83,"Ianeti"),(83,"Kormaghali"),(83,"Melauri"),
                (83,"Nabakevi"),(83,"Najaxao"),(83,"Nigorzgva"),(83,"Ninuakutkhe"),
                (83,"Nogha"),(83,"Sajavakho"),(83,"Tolebi"),(83,"Vazisubani"),
                (83,"Xunjulauri"),(83,"Zeda Gomi"),

                // 86 Senaki
                (86,"Axalsofeli"),(86,"Betlemi"),(86,"Dzveli Senaki"),(86,"Eki"),
                (86,"Fotsxo"),(86,"Gejeti"),(86,"Golaskuri"),(86,"Kotianeti"),
                (86,"Ledzadzame"),(86,"Legogine"),(86,"Menji"),(86,"Noqalaqevi"),
                (86,"Nosiri"),(86,"Pirveli Nosiri"),(86,"Saadamio"),(86,"Sakharbedio"),
                (86,"Sanadaraio"),(86,"Satsuleiskiro"),(86,"Second Nosiri"),
                (86,"Shua Nosiri"),(86,"Teklati"),(86,"Tyirshi"),(86,"Ushafati"),
                (86,"Xorshi"),(86,"Zana"),

                // 88 Shuakhevi
                (88,"Axaldaba"),(88,"Chala"),(88,"Chvana"),(88,"Dgvani"),(88,"Furtio"),
                (88,"Goginauri"),(88,"Karapeti"),(88,"Khichauri"),(88,"Maxalakidzeebi"),
                (88,"Nenia"),(88,"Wablana"),(88,"Wyarota"),

                // 89 Sighnaghi
                (89,"Anaga"),(89,"Bodbiskhevi"),(89,"Bodbisxevi"),(89,"Djugani"),
                (89,"Dzveli Anaga"),(89,"Erisimedi"),(89,"Iliawminda"),(89,"Magaro"),
                (89,"Mashnaari"),(89,"Nukriani"),(89,"Qvemo Bodbe"),(89,"Qvemo Machxaani"),
                (89,"Qvemo Magaro"),(89,"Saqobo"),(89,"Tibaani"),(89,"Vaqiri"),
                (89,"Xirsa"),(89,"Zemo Bodbe"),(89,"Zemo Magaro"),

                // 90 Stepantsminda
                (90,"Achxoti"),(90,"Arsha"),(90,"Eshtia"),(90,"Garbani"),(90,"Gergeti"),
                (90,"Goriscixe"),(90,"Kobi"),(90,"Sioni"),(90,"Sno"),

                // 91 Surami
                (91,"Itria"),(91,"Urtkhva"),

                // 92 Tbilisi
                (92,"Betania"),(92,"Kiketi"),(92,"Kojori"),(92,"Shindisi"),
                (92,"Tabakhmela"),(92,"Tsavkisi"),(92,"Tskneti"),

                // 93 Telavi
                (93,"Akhateli"),(93,"Akura"),(93,"Artana"),(93,"Busheti"),
                (93,"Chaduniani"),(93,"Dalisyuri"),(93,"Fshaveli"),(93,"Gulgula"),
                (93,"Iyalto"),(93,"Jugaani"),(93,"Kisisxevi"),(93,"Kondoli"),
                (93,"Kurdgelauri"),(93,"Lafanyuri"),(93,"Lalisyuri"),(93,"Lechuri"),
                (93,"Nafareuli"),(93,"Nasamxrali"),(93,"Qvemo Xodaseni"),(93,"Ruispiri"),
                (93,"Saniore"),(93,"Shalauri"),(93,"Tetriwylebi"),(93,"Vanta"),
                (93,"Vardisubani"),(93,"Yarajala"),

                // 95 Terjola
                (95,"Akhali Terjola"),(95,"Alisubani"),(95,"Bardubani"),(95,"Brolisqedi"),
                (95,"Chognauri"),(95,"Chxairi"),(95,"Dzevri"),(95,"Eweri"),(95,"Gogni"),
                (95,"Gvankiti"),(95,"Kvaxchiri"),(95,"Kveda Alisubani"),(95,"Kveda Simoneti"),
                (95,"Naxshirgele"),(95,"Odilauri"),(95,"Rufoti"),(95,"Sarbevi"),
                (95,"Siqtarva"),(95,"Skande"),(95,"Tuzi"),(95,"Vardigora"),
                (95,"Zeda Sazano"),(95,"Zeda Simoneti"),

                // 96 Tetritskaro
                (96,"Akhalsofeli"),(96,"Aleqseevka"),(96,"Asureti"),(96,"Bogvi"),
                (96,"Borbalo"),(96,"Chivchavi"),(96,"Chxikvta"),(96,"Didgori"),
                (96,"Enageti"),(96,"Ertisi"),(96,"Farcxisi"),(96,"Ghoubani"),
                (96,"Golteti"),(96,"Jorjiashvili"),(96,"Koda"),(96,"Marabda"),
                (96,"Muxati"),(96,"Orbeti"),(96,"Pantiani"),(96,"Patara Iraga"),
                (96,"Sagrasheni"),(96,"Samshvilde"),(96,"Shavsaydari"),(96,"Tbisi"),
                (96,"Vashlovani"),(96,"Winwyaro"),(96,"Xaishi"),

                // 97 Tianeti
                (97,"Akhalsopeli"),(97,"Bochorma"),(97,"Chabano"),(97,"Daba Sioni"),
                (97,"Devenaantkhevi"),(97,"Gojiaanebi"),(97,"Gudanelebi"),(97,"Gulelebi"),
                (97,"Iarajulebi"),(97,"Khevsurtsopeli"),(97,"Lelubani"),(97,"Magraneti"),
                (97,"Saydrioni"),(97,"Simoniantkhevi"),(97,"Tetraxevi"),(97,"Tolaani"),
                (97,"Tolenji"),(97,"Tskhvaritchamia"),(97,"Tushurebi"),(97,"Vedatkhevi"),
                (97,"Zemo Nakhalakhari"),(97,"Zhebota"),

                // 99 Tkibuli
                (99,"Axalsofeli"),(99,"Cucxvati"),(99,"Dabadzeli"),(99,"Gelati"),
                (99,"Gurna"),(99,"Kursebi"),(99,"Maboslevi"),(99,"Manchiori"),
                (99,"Naboslevi"),(99,"Orpiri"),(99,"Samtredia"),(99,"Sawire"),
                (99,"Sochxeti"),

                // 100 Tsageri
                (100,"Aghvi"),(100,"Bardnala"),(100,"Chalistavi"),(100,"Chxuteli"),
                (100,"Kveda Tsageri"),(100,"Lailashi"),(100,"Lajana"),(100,"Lajani"),
                (100,"Lasuriashi"),(100,"Maxashi"),(100,"Orbeli"),(100,"Orxvi"),
                (100,"Oyureshi"),(100,"Wiferchi"),(100,"Zubi"),

                // 102 Tsalenjikha
                (102,"Chale"),(102,"Chqvaleri"),(102,"Djgali"),(102,"Djvari"),
                (102,"Eweri"),(102,"Faxulani"),(102,"Kuxeshi"),(102,"Lia"),
                (102,"Medani"),(102,"Miqava"),(102,"Mujava"),(102,"Naguru"),
                (102,"Nakifu"),(102,"Obuji"),(102,"Sachino"),(102,"Squri"),
                (102,"Uluria"),(102,"Zeda Lia"),

                // 103 Tsalka
                (103,"Arwivani"),(103,"Ashxala"),(103,"Avranlo"),(103,"Axalsheni"),
                (103,"Bareti"),(103,"Berta"),(103,"Beshtasheni"),(103,"Daba Trialeti"),
                (103,"Darakovi"),(103,"Gantiadi"),(103,"Gumbati"),(103,"Imera"),
                (103,"Koxta"),(103,"Kurchi"),(103,"Nardevani"),(103,"Orbeti"),
                (103,"Ozni"),(103,"Rexa"),(103,"Sameba"),(103,"Saydrioni"),
                (103,"Tbeti"),(103,"Ushchi"),(103,"Xareba"),

                // 107 Tskaltubo
                (107,"Banodja"),(107,"Chuneshi"),(107,"Farcxanayanevi"),(107,"Geguti"),
                (107,"Gubiswyali"),(107,"Gumati"),(107,"Gumbra"),(107,"Gumbrini"),
                (107,"Gvishtibi"),(107,"Maglaki"),(107,"Mesxeti"),(107,"Muxiani"),
                (107,"Nagarevi"),(107,"Nogha"),(107,"Ofshkviti"),(107,"Ofurchxeti"),
                (107,"Patriketi"),(107,"Qveda Mesxeti"),(107,"Qvilishori"),(107,"Rioni"),
                (107,"Sayulia"),(107,"Sormoni"),(107,"Ternali"),(107,"Tskhunkuri"),
                (107,"Tyachiri"),(107,"Ukaneti"),(107,"Xomuli"),(107,"Yumistavi"),
                (107,"Zarati"),(107,"Zeda Mesxeti"),

                // 110 Ureki
                (110,"Kaprovani"),

                // 112 Vani
                (112,"Amaghleba"),(112,"Bzvani"),(112,"Chyvishi"),(112,"Cixesulori"),
                (112,"Dixashxo"),(112,"Dzuluxi"),(112,"Fereta"),(112,"Inashauri"),
                (112,"Isriti"),(112,"Kushubouri"),(112,"Kveda Gora"),(112,"Mtisdziri"),
                (112,"Salominao"),(112,"Salxino"),(112,"Shua Gora"),(112,"Shuamta"),
                (112,"Sulori"),(112,"Tobanieri"),(112,"Uxuti"),(112,"Yumuri"),
                (112,"Zeda Gora"),(112,"Zeda Vani"),(112,"Zeindari"),

                // 116 Zestafoni
                (116,"Alaverdi"),(116,"Argveta"),(116,"Boslevi"),(116,"Cxentaro"),
                (116,"Cxrawyaro"),(116,"Didi Gantiadi"),(116,"Dilikauri"),(116,"Dzirula"),
                (116,"Futi"),(116,"Ilemi"),(116,"Kldeeti"),(116,"Kvaliti"),
                (116,"Meore Sviri"),(116,"Pirveli Sviri"),(116,"Qveda Saqara"),
                (116,"Qveda Sazano"),(116,"Rkvia"),(116,"Rodinauri"),(116,"Shorapani"),
                (116,"Shrosha"),(116,"Tabakini"),(116,"Tvrini"),(116,"Weva"),
                (116,"Wiflavake"),(116,"Xoxoula"),(116,"Zeda Saqara"),(116,"Zovreti"),

                // 117 Zugdidi
                (117,"Alertkari"),(117,"Anaklia"),(117,"Axalabastumani"),(117,"Axalkaxati"),
                (117,"Axalsofeli"),(117,"Bashi"),(117,"Chaqvinji"),(117,"Chitanwyaro"),
                (117,"Chkaduashi"),(117,"Chxoria"),(117,"Daba Jvari"),(117,"Darcheli"),
                (117,"Davitiani"),(117,"Didi Nedzi"),(117,"Ergeta"),(117,"Ganmuxuri"),
                (117,"Grigolishi"),(117,"Ingiri"),(117,"Jixashkari"),(117,"Jumi"),
                (117,"Jvarzeni"),(117,"Kaxati"),(117,"Koki"),(117,"Kolxida"),
                (117,"Korcxeli"),(117,"Kurtsxeli"),(117,"Kvemo Kakhati"),(117,"Mujava"),
                (117,"Nacatu"),(117,"Narazeni"),(117,"Nawuluku"),(117,"Odishi"),
                (117,"Oireme"),(117,"Old Abastumani"),(117,"Oqtomberi"),(117,"Orsantia"),
                (117,"Oruli"),(117,"Owane"),(117,"Palouri"),(117,"Riye"),(117,"Ruxi"),
                (117,"Shamgona"),(117,"Tyaia"),(117,"Urta"),(117,"Witawyari"),
                (117,"Wyoushi"),(117,"Xurcha"),(117,"Yulishkari"),(117,"Zeda Eweri"),
            };

            for (int i = 0; i < districts.Length; i++)
            {
                migrationBuilder.InsertData(
                    table: "Districts",
                    columns: new[] { "Id", "DistrictName", "CityId", "CreatedAt", "DateDeleted" },
                    values: new object[]
                    {
                        Guid.NewGuid(),
                        districts[i].Name,
                        cityIds[districts[i].CityIdx - 1],
                        now,
                        null
                    });
            }
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DELETE FROM Districts");
            migrationBuilder.Sql("DELETE FROM Cities");
        }
    }
}