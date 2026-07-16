/**
 * Apply AI disclosure updates to src/i18n/legal-translations/*.json
 * Run: node scripts/apply-legal-ai-disclosure.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const langs = ["de", "fr", "ro", "it", "es", "sv", "no", "nl", "bg"];

const LAST_UPDATED = {
  de: "16. Juli 2026",
  fr: "16 juillet 2026",
  ro: "16 iulie 2026",
  it: "16 luglio 2026",
  es: "16 de julio de 2026",
  sv: "16 juli 2026",
  no: "16. juli 2026",
  nl: "16 juli 2026",
  bg: "16 юли 2026",
};

const COPY = {
  de: {
    whenCollectP1:
      "Wir erheben Daten, wenn Sie ein Konto erstellen, Velbok abonnieren, ein Studio konfigurieren, Buchungen oder Abrechnungen verwalten, Einwilligungsformulare ausfüllen, In-App-Nachrichten nutzen, KI-Schablonen-Tools verwenden, den Support kontaktieren oder Zahlungsfunktionen im Web oder mobil nutzen.",
    ai: {
      title: "KI-Funktionen und KI-Verarbeitung durch Drittanbieter",
      p1: "Velbok bietet optionale KI-gestützte Tools, einschließlich Tattoo-Schablonen-Generierung. Wenn Sie die KI-Schablonen-Generierung wählen, senden wir das von Ihnen hochgeladene Referenzbild und Ihre gewählte Stilpräferenz an Netlify, das die Anfrage über Netlify AI Gateway an Googles Gemini-Bildmodell weiterleitet. Die Verarbeitung ist mit Ihrem angemeldeten Konto verknüpft, unterliegt nutzungsbezogenen Kontolimits und dient ausschließlich der Erstellung der angeforderten Schablone.",
      p2: "KI-generierte Schablonen-Vorschauen werden bis zu 24 Stunden in unserem Dateispeicher aufbewahrt und dann automatisch gelöscht. Wir verwenden Ihre Referenzbilder oder KI-Ausgaben nicht zum Training eigener Modelle und verkaufen diese Inhalte nicht an Dritte. Die AGB und Datenschutzrichtlinien von Google und Netlify gelten für deren Verarbeitung. Laden Sie keine Bilder hoch, für die Sie keine Rechte haben, oder Inhalte mit unnötigen personenbezogenen oder besonderen Kategorien personenbezogener Daten.",
      p3: "Optionaler telefonischer Velbok-Plattform-Support kann KI-Sprachdienste von Drittanbietern (Vapi) nutzen. Anrufmetadaten und Transkripte können zu Qualitäts- und Supportzwecken protokolliert werden, wie in unserem Abschnitt zu Dienstleistern beschrieben.",
    },
    subprocessorsP1:
      "Wir nutzen vertrauenswürdige Anbieter zum Betrieb von Velbok, darunter: Supabase (Authentifizierung, Datenbank, Dateispeicher, Edge Functions), Stripe (Zahlungen, Connect-Auszahlungen, Terminal / Tap to Pay), Resend (Transaktions-E-Mails), Twilio (optionales WhatsApp/SMS pro Studio), Netlify (Website-Hosting und AI Gateway für Schablonen-Generierung über Google Gemini) und Vapi (optionaler Plattform-Sprachsupport). Jeder Anbieter verarbeitet Daten vertraglich und gemäß seinen eigenen Datenschutzbedingungen.",
    contractDesc:
      "Bereitstellung des Velbok-Dienstes, Studio-Abonnements, Buchungen, Anzahlungen, Rechnungen und auf Ihrem Tarif aktivierte KI-Schablonen-Tools.",
    howUseP1:
      "Wir nutzen personenbezogene Daten, um Velbok zu betreiben, Nutzer zu authentifizieren, Studio-Abonnements und Kundenzahlungen zu verarbeiten, Benachrichtigungen und auf Ihrem Tarif aktivierte KI-Funktionen bereitzustellen, Studios zu unterstützen, die Zuverlässigkeit zu verbessern und gesetzliche Pflichten zu erfüllen.",
    acceptableUseP2:
      "Sie dürfen über KI-Funktionen keine rechtswidrigen, rechtsverletzenden oder unnötig sensiblen personenbezogenen Daten übermitteln.",
    dataProcessingP3:
      "Wenn Sie KI-Funktionen (z. B. Schablonen-Generierung) nutzen, weisen Sie uns an, hochgeladene Referenzbilder ausschließlich zur Bereitstellung dieser Funktion über KI-Drittanbieter zu verarbeiten, wie in unserem Datenschutzhinweis beschrieben. Sie sind dafür verantwortlich, dass Sie Rechte an den eingereichten Inhalten haben und dass diese Einreichungen geltendem Recht entsprechen.",
    thirdPartyP1:
      "Der Dienst integriert Drittanbieter wie Stripe (Zahlungen), Supabase (Hosting), E-Mail-Anbieter, Netlify AI Gateway mit Google Gemini (KI-Schablonen-Generierung) und Vapi (optionaler Plattform-Sprachsupport). Deren AGB und Datenschutzrichtlinien gelten für deren Dienste. Wir haften nicht für Ausfälle, Fehler oder Handlungen von Drittanbietern außerhalb unserer angemessenen Kontrolle.",
    thirdPartyP2:
      "KI-Drittanbieter verarbeiten Daten nur zur Bereitstellung der angeforderten Funktion. Wir verlangen, dass diese Verarbeitung auf die Erbringung des Dienstes beschränkt ist und Ihre Inhalte nicht für unabhängige Trainingszwecke des Anbieters genutzt werden, vorbehaltlich der jeweiligen Richtlinien des Anbieters.",
    disclaimerP2:
      "KI-generierte Ausgaben (z. B. Schablonen) dienen nur der Designunterstützung. Ausgaben können unvollkommen sein; Sie sind dafür verantwortlich, sie vor dem Einsatz bei Kunden zu prüfen.",
  },
  fr: {
    whenCollectP1:
      "Nous collectons des données lorsque vous créez un compte, vous abonnez à Velbok, configurez un studio, gérez des réservations ou la facturation, complétez des formulaires de consentement, utilisez la messagerie intégrée, utilisez les outils de pochoirs IA, contactez le support ou utilisez les fonctions de paiement sur le web ou mobile.",
    ai: {
      title: "Fonctionnalités IA et traitement par des fournisseurs IA tiers",
      p1: "Velbok propose des outils optionnels alimentés par l'IA, notamment la génération de pochoirs de tatouage. Lorsque vous choisissez la génération de pochoir IA, nous envoyons l'image de référence que vous téléversez et votre préférence de style à Netlify, qui achemine la demande vers le modèle d'image Gemini de Google via Netlify AI Gateway. Le traitement est lié à votre compte connecté, soumis aux limites d'utilisation du compte, et sert uniquement à générer le pochoir demandé.",
      p2: "Les aperçus de pochoirs générés par l'IA sont stockés dans notre espace de fichiers pendant 24 heures maximum, puis supprimés automatiquement. Nous n'utilisons pas vos images de référence ni les sorties IA pour entraîner nos propres modèles, et nous ne vendons pas ce contenu à des tiers. Les conditions et politiques de confidentialité de Google et Netlify s'appliquent à leur traitement. Ne téléversez pas d'images que vous n'avez pas le droit d'utiliser, ni de contenu incluant des données personnelles ou des catégories particulières inutiles.",
      p3: "Le support téléphonique optionnel de la plateforme Velbok peut utiliser une IA vocale tierce (Vapi). Les métadonnées d'appel et les transcriptions peuvent être enregistrées à des fins de qualité et de support, comme décrit dans notre section sur les prestataires.",
    },
    subprocessorsP1:
      "Nous utilisons des prestataires de confiance pour faire fonctionner Velbok, notamment : Supabase (authentification, base de données, stockage de fichiers, fonctions edge), Stripe (paiements, versements Connect, Terminal / Tap to Pay), Resend (e-mails transactionnels), Twilio (WhatsApp/SMS optionnel par studio), Netlify (hébergement du site et AI Gateway pour la génération de pochoirs via Google Gemini) et Vapi (support vocal optionnel de la plateforme). Chaque prestataire traite les données sous contrat et selon ses propres conditions de confidentialité.",
    contractDesc:
      "fourniture du service Velbok, abonnements studio, réservations, acomptes, factures et outils de pochoirs IA activés sur votre forfait.",
    howUseP1:
      "Nous utilisons les données personnelles pour exploiter Velbok, authentifier les utilisateurs, traiter les abonnements studio et les paiements clients, fournir des notifications et les fonctionnalités IA activées sur votre forfait, assister les studios, améliorer la fiabilité et respecter nos obligations légales.",
    acceptableUseP2:
      "Vous ne devez pas soumettre via les fonctionnalités IA des données personnelles illicites, contrefaisantes ou inutilement sensibles.",
    dataProcessingP3:
      "Lorsque vous utilisez des fonctionnalités IA (telles que la génération de pochoirs), vous nous demandez de traiter les images de référence téléversées via des fournisseurs IA tiers uniquement pour fournir cette fonctionnalité, comme décrit dans notre Notice de confidentialité. Vous êtes responsable de disposer des droits sur tout contenu soumis et de respecter la loi applicable.",
    thirdPartyP1:
      "Le Service intègre des tiers tels que Stripe (paiements), Supabase (hébergement), des fournisseurs d'e-mail, Netlify AI Gateway avec Google Gemini (génération de pochoirs IA) et Vapi (support vocal optionnel de la plateforme). Leurs conditions et politiques de confidentialité s'appliquent à leurs services. Nous ne sommes pas responsables des interruptions, erreurs ou actes de prestataires tiers hors de notre contrôle raisonnable.",
    thirdPartyP2:
      "Les fournisseurs IA tiers ne traitent les données que pour fournir la fonctionnalité demandée. Nous exigeons que ce traitement soit limité à la fourniture du Service et ne serve pas à entraîner des modèles sur votre contenu à des fins non liées, sous réserve des politiques de chaque fournisseur.",
    disclaimerP2:
      "Les sorties générées par l'IA (telles que les pochoirs) sont fournies uniquement à titre d'aide à la conception. Les sorties peuvent être imparfaites ; vous êtes responsable de les vérifier avant toute utilisation sur un client.",
  },
  nl: {
    whenCollectP1:
      "Wij verzamelen gegevens wanneer u een account aanmaakt, zich abonneert op Velbok, een studio configureert, boekingen of facturering beheert, toestemmingsformulieren invult, in-app berichten gebruikt, AI-stenciltools gebruikt, support contacteert of betalingsfuncties gebruikt op web of mobiel.",
    ai: {
      title: "AI-functies en verwerking door externe AI-aanbieders",
      p1: "Velbok biedt optionele AI-gestuurde tools, waaronder het genereren van tatoeage-stencils. Wanneer u kiest voor AI-stencilgeneratie, sturen wij de referentieafbeelding die u uploadt en uw gekozen stijlvoorkeur naar Netlify, dat het verzoek via Netlify AI Gateway doorstuurt naar het Gemini-beeldmodel van Google. Verwerking is gekoppeld aan uw ingelogde account, onderworpen aan gebruikslimieten per account, en wordt alleen gebruikt om het door u gevraagde stencil te genereren.",
      p2: "Door AI gegenereerde stencilvoorbeelden worden maximaal 24 uur in onze bestandsopslag bewaard en daarna automatisch verwijderd. Wij gebruiken uw referentieafbeeldingen of AI-uitvoer niet om onze eigen modellen te trainen en verkopen deze inhoud niet aan derden. De voorwaarden en privacybeleid van Google en Netlify zijn van toepassing op hun verwerking. Upload geen afbeeldingen die u niet mag gebruiken, of inhoud met onnodige persoonsgegevens of bijzondere categorieën gegevens.",
      p3: "Optionele telefonische Velbok-platformsupport kan gebruikmaken van externe spraak-AI (Vapi). Oproepmetadata en transcripties kunnen worden gelogd voor kwaliteits- en supportdoeleinden, zoals beschreven in onze sectie over dienstverleners.",
    },
    subprocessorsP1:
      "Wij gebruiken betrouwbare leveranciers om Velbok te runnen, waaronder: Supabase (authenticatie, database, bestandsopslag, edge-functies), Stripe (betalingen, Connect-uitbetalingen, Terminal / Tap to Pay), Resend (transactionele e-mail), Twilio (optionele WhatsApp/SMS per studio), Netlify (websitehosting en AI Gateway voor stencilgeneratie via Google Gemini) en Vapi (optionele platformspraakondersteuning). Elke leverancier verwerkt gegevens onder contract en hun eigen privacyvoorwaarden.",
    contractDesc:
      "levering van de Velbok-dienst, studio-abonnementen, boekingen, aanbetalingen, facturen en AI-stenciltools die op uw abonnement zijn ingeschakeld.",
    howUseP1:
      "Wij gebruiken persoonsgegevens om Velbok te exploiteren, gebruikers te authenticeren, studio-abonnementen en klantbetalingen te verwerken, meldingen en AI-functies die op uw abonnement zijn ingeschakeld te leveren, studio's te ondersteunen, betrouwbaarheid te verbeteren en aan wettelijke verplichtingen te voldoen.",
    acceptableUseP2:
      "U mag via AI-functies geen onrechtmatige, inbreukmakende of onnodig gevoelige persoonsgegevens indienen.",
    dataProcessingP3:
      "Wanneer u AI-functies gebruikt (zoals stencilgeneratie), geeft u ons de opdracht om geüploade referentieafbeeldingen uitsluitend via externe AI-aanbieders te verwerken om die functie te leveren, zoals beschreven in onze Privacyverklaring. U bent verantwoordelijk voor het hebben van rechten op alle ingediende inhoud en dat inzendingen voldoen aan toepasselijk recht.",
    thirdPartyP1:
      "De Dienst integreert derden zoals Stripe (betalingen), Supabase (hosting), e-mailproviders, Netlify AI Gateway met Google Gemini (AI-stencilgeneratie) en Vapi (optionele platformspraakondersteuning). Hun voorwaarden en privacybeleid zijn van toepassing op hun diensten. Wij zijn niet aansprakelijk voor uitval, fouten of handelingen van derde aanbieders buiten onze redelijke controle.",
    thirdPartyP2:
      "Externe AI-aanbieders verwerken gegevens alleen om de gevraagde functie te leveren. Wij vereisen dat dergelijke verwerking beperkt blijft tot het leveren van de Dienst en niet wordt gebruikt om modellen te trainen op uw inhoud voor niet-gerelateerde doeleinden van de aanbieder, onder voorbehoud van het beleid van elke aanbieder.",
    disclaimerP2:
      "Door AI gegenereerde uitvoer (zoals stencils) wordt alleen geboden als ontwerpondersteuning. Uitvoer kan onvolmaakt zijn; u bent verantwoordelijk voor het controleren ervan vóór gebruik bij klanten.",
  },
  it: {
    whenCollectP1:
      "Raccogliamo dati quando crei un account, ti abboni a Velbok, configuri uno studio, gestisci prenotazioni o fatturazione, compili moduli di consenso, usi la messaggistica in-app, usi gli strumenti di stencil IA, contatti il supporto o usi le funzioni di pagamento su web o mobile.",
    ai: {
      title: "Funzionalità IA e trattamento tramite fornitori IA di terze parti",
      p1: "Velbok offre strumenti opzionali basati sull'IA, inclusa la generazione di stencil per tatuaggi. Quando scegli la generazione stencil IA, inviamo l'immagine di riferimento caricata e la preferenza di stile selezionata a Netlify, che instrada la richiesta al modello immagine Gemini di Google tramite Netlify AI Gateway. Il trattamento è collegato al tuo account connesso, soggetto a limiti di utilizzo per account, e serve solo a generare lo stencil richiesto.",
      p2: "Le anteprime di stencil generate dall'IA sono archiviate nel nostro storage file per un massimo di 24 ore e poi eliminate automaticamente. Non usiamo le tue immagini di riferimento o gli output IA per addestrare i nostri modelli e non vendiamo questo contenuto a terzi. Si applicano i termini e le informative privacy di Google e Netlify. Non caricare immagini che non hai il diritto di usare, né contenuti con dati personali o categorie particolari non necessari.",
      p3: "Il supporto telefonico opzionale della piattaforma Velbok può usare IA vocale di terze parti (Vapi). Metadati delle chiamate e trascrizioni possono essere registrati per qualità e supporto, come descritto nella sezione sui fornitori di servizi.",
    },
    subprocessorsP1:
      "Utilizziamo fornitori affidabili per gestire Velbok, tra cui: Supabase (autenticazione, database, archiviazione file, edge functions), Stripe (pagamenti, payout Connect, Terminal / Tap to Pay), Resend (email transazionali), Twilio (WhatsApp/SMS opzionale per studio), Netlify (hosting del sito e AI Gateway per la generazione di stencil tramite Google Gemini) e Vapi (supporto vocale opzionale della piattaforma). Ogni fornitore tratta i dati in base a contratto e alle proprie condizioni privacy.",
    contractDesc:
      "fornitura del servizio Velbok, abbonamenti studio, prenotazioni, acconti, fatture e strumenti stencil IA abilitati sul tuo piano.",
    howUseP1:
      "Utilizziamo i dati personali per gestire Velbok, autenticare gli utenti, elaborare abbonamenti studio e pagamenti clienti, fornire notifiche e funzionalità IA abilitate sul tuo piano, supportare gli studi, migliorare l'affidabilità e adempiere agli obblighi legali.",
    acceptableUseP2:
      "Non devi inviare tramite le funzionalità IA dati personali illeciti, lesivi o inutilmente sensibili.",
    dataProcessingP3:
      "Quando usi funzionalità IA (come la generazione di stencil), ci istruisci a trattare le immagini di riferimento caricate tramite fornitori IA di terze parti esclusivamente per fornire quella funzionalità, come descritto nella nostra Informativa privacy. Sei responsabile di avere i diritti sui contenuti inviati e che gli invii rispettino la legge applicabile.",
    thirdPartyP1:
      "Il Servizio integra terze parti come Stripe (pagamenti), Supabase (hosting), provider email, Netlify AI Gateway con Google Gemini (generazione stencil IA) e Vapi (supporto vocale opzionale della piattaforma). I loro termini e informative privacy si applicano ai loro servizi. Non siamo responsabili per interruzioni, errori o atti di fornitori terzi oltre il nostro ragionevole controllo.",
    thirdPartyP2:
      "I fornitori IA di terze parti trattano i dati solo per fornire la funzionalità richiesta. Richiediamo che tale trattamento sia limitato all'erogazione del Servizio e non sia usato per addestrare modelli sui tuoi contenuti per scopi non correlati del fornitore, fatto salvo le policy di ciascun fornitore.",
    disclaimerP2:
      "Gli output generati dall'IA (come gli stencil) sono forniti solo come assistenza al design. Gli output possono essere imperfetti; sei responsabile di verificarli prima dell'uso sui clienti.",
  },
  es: {
    whenCollectP1:
      "Recopilamos datos cuando crea una cuenta, se suscribe a Velbok, configura un estudio, gestiona reservas o facturación, completa formularios de consentimiento, usa la mensajería en la app, usa las herramientas de plantillas con IA, contacta con soporte o usa funciones de pago en web o móvil.",
    ai: {
      title: "Funciones de IA y tratamiento por proveedores de IA de terceros",
      p1: "Velbok ofrece herramientas opcionales con IA, incluida la generación de plantillas de tatuaje. Cuando elige la generación de plantillas con IA, enviamos la imagen de referencia que sube y su preferencia de estilo a Netlify, que enruta la solicitud al modelo de imagen Gemini de Google mediante Netlify AI Gateway. El tratamiento está vinculado a su cuenta iniciada, sujeto a límites de uso por cuenta, y se usa solo para generar la plantilla solicitada.",
      p2: "Las vistas previas de plantillas generadas por IA se almacenan en nuestro almacenamiento de archivos hasta 24 horas y luego se eliminan automáticamente. No usamos sus imágenes de referencia ni salidas de IA para entrenar nuestros propios modelos, y no vendemos este contenido a terceros. Se aplican los términos y políticas de privacidad de Google y Netlify. No suba imágenes que no tenga derecho a usar, ni contenido con datos personales o categorías especiales innecesarios.",
      p3: "El soporte telefónico opcional de la plataforma Velbok puede usar IA de voz de terceros (Vapi). Los metadatos de llamadas y las transcripciones pueden registrarse para calidad y soporte, como se describe en nuestra sección de proveedores de servicios.",
    },
    subprocessorsP1:
      "Usamos proveedores de confianza para operar Velbok, incluidos: Supabase (autenticación, base de datos, almacenamiento de archivos, funciones edge), Stripe (pagos, pagos Connect, Terminal / Tap to Pay), Resend (correo transaccional), Twilio (WhatsApp/SMS opcional por estudio), Netlify (alojamiento web y AI Gateway para generación de plantillas mediante Google Gemini) y Vapi (soporte de voz opcional de la plataforma). Cada proveedor procesa datos bajo contrato y sus propios términos de privacidad.",
    contractDesc:
      "prestación del servicio Velbok, suscripciones de estudio, reservas, depósitos, facturas y herramientas de plantillas con IA habilitadas en su plan.",
    howUseP1:
      "Usamos datos personales para operar Velbok, autenticar usuarios, procesar suscripciones de estudio y pagos de clientes, enviar notificaciones y funciones de IA habilitadas en su plan, apoyar estudios, mejorar la fiabilidad y cumplir obligaciones legales.",
    acceptableUseP2:
      "No debe enviar a través de las funciones de IA datos personales ilícitos, infractores o innecesariamente sensibles.",
    dataProcessingP3:
      "Cuando usa funciones de IA (como la generación de plantillas), nos instruye para procesar imágenes de referencia subidas a través de proveedores de IA de terceros únicamente para ofrecer esa función, como se describe en nuestro Aviso de privacidad. Usted es responsable de tener derechos sobre el contenido enviado y de que las presentaciones cumplan la ley aplicable.",
    thirdPartyP1:
      "El Servicio integra terceros como Stripe (pagos), Supabase (alojamiento), proveedores de correo, Netlify AI Gateway con Google Gemini (generación de plantillas con IA) y Vapi (soporte de voz opcional de la plataforma). Sus términos y políticas de privacidad se aplican a sus servicios. No somos responsables de interrupciones, errores o actos de proveedores terceros fuera de nuestro control razonable.",
    thirdPartyP2:
      "Los proveedores de IA de terceros procesan datos solo para proporcionar la función solicitada. Exigimos que dicho procesamiento se limite a prestar el Servicio y no se use para entrenar modelos con su contenido para fines no relacionados del proveedor, sujeto a las políticas de cada proveedor.",
    disclaimerP2:
      "Las salidas generadas por IA (como plantillas) se proporcionan solo como ayuda de diseño. Las salidas pueden ser imperfectas; usted es responsable de revisarlas antes de usarlas con clientes.",
  },
  sv: {
    whenCollectP1:
      "Vi samlar in data när du skapar ett konto, prenumererar på Velbok, konfigurerar en studio, hanterar bokningar eller fakturering, fyller i samtyckesformulär, använder meddelanden i appen, använder AI-stencilverktyg, kontaktar support eller använder betalningsfunktioner på webb eller mobil.",
    ai: {
      title: "AI-funktioner och behandling via tredjeparts-AI",
      p1: "Velbok erbjuder valfria AI-drivna verktyg, inklusive generering av tatueringsstencil. När du väljer AI-stencilgenerering skickar vi referensbilden du laddar upp och din valda stilpreferens till Netlify, som vidarebefordrar begäran till Googles Gemini-bildmodell via Netlify AI Gateway. Behandlingen är kopplad till ditt inloggade konto, omfattas av användningsgränser per konto och används endast för att generera den begärda stencilen.",
      p2: "AI-genererade stencilförhandsvisningar lagras i vår fillagring i upp till 24 timmar och raderas sedan automatiskt. Vi använder inte dina referensbilder eller AI-utdata för att träna våra egna modeller och säljer inte detta innehåll till tredje part. Googles och Netlifys villkor och integritetspolicyer gäller för deras behandling. Ladda inte upp bilder du inte har rätt att använda, eller innehåll med onödiga personuppgifter eller särskilda kategorier av data.",
      p3: "Valfri telefonsupport för Velbok-plattformen kan använda tredjeparts röst-AI (Vapi). Samtalsmetadata och transkriptioner kan loggas för kvalitet och support, enligt vår sektion om tjänsteleverantörer.",
    },
    subprocessorsP1:
      "Vi använder betrodda leverantörer för att driva Velbok, inklusive: Supabase (autentisering, databas, fillagring, edge-funktioner), Stripe (betalningar, Connect-utbetalningar, Terminal / Tap to Pay), Resend (transaktionsmejl), Twilio (valfritt WhatsApp/SMS per studio), Netlify (webbhotell och AI Gateway för stencilgenerering via Google Gemini) och Vapi (valfri plattformsröstsupport). Varje leverantör behandlar data enligt avtal och sina egna integritetsvillkor.",
    contractDesc:
      "tillhandahållande av Velbok-tjänsten, studioprenumerationer, bokningar, depositioner, fakturor och AI-stencilverktyg aktiverade på din plan.",
    howUseP1:
      "Vi använder personuppgifter för att driva Velbok, autentisera användare, behandla studioprenumerationer och kundbetalningar, leverera aviseringar och AI-funktioner aktiverade på din plan, stödja studior, förbättra tillförlitlighet och uppfylla rättsliga skyldigheter.",
    acceptableUseP2:
      "Du får inte skicka in olagliga, intrångsgörande eller onödigt känsliga personuppgifter via AI-funktioner.",
    dataProcessingP3:
      "När du använder AI-funktioner (som stencilgenerering) instruerar du oss att behandla uppladdade referensbilder via tredjeparts-AI-leverantörer enbart för att leverera den funktionen, enligt vår integritetspolicy. Du ansvarar för att ha rättigheter till allt innehåll du skickar in och att inlämningar följer tillämplig lag.",
    thirdPartyP1:
      "Tjänsten integrerar tredje parter som Stripe (betalningar), Supabase (hosting), e-postleverantörer, Netlify AI Gateway med Google Gemini (AI-stencilgenerering) och Vapi (valfri plattformsröstsupport). Deras villkor och integritetspolicyer gäller för deras tjänster. Vi ansvarar inte för avbrott, fel eller handlingar från tredjepartsleverantörer utanför vår rimliga kontroll.",
    thirdPartyP2:
      "Tredjeparts-AI-leverantörer behandlar data endast för att tillhandahålla den begärda funktionen. Vi kräver att sådan behandling begränsas till att leverera Tjänsten och inte används för att träna modeller på ditt innehåll för leverantörens orelaterade ändamål, med förbehåll för varje leverantörs policy.",
    disclaimerP2:
      "AI-genererade utdata (som stenciler) tillhandahålls endast som designhjälp. Utdata kan vara ofullkomliga; du ansvarar för att granska dem innan användning på kunder.",
  },
  no: {
    whenCollectP1:
      "Vi samler inn data når du oppretter en konto, abonnerer på Velbok, konfigurerer et studio, administrerer bestillinger eller fakturering, fullfører samtykkeskjemaer, bruker meldinger i appen, bruker AI-stencilverktøy, kontakter support eller bruker betalingsfunksjoner på web eller mobil.",
    ai: {
      title: "AI-funksjoner og behandling via tredjeparts-AI",
      p1: "Velbok tilbyr valgfrie AI-drevne verktøy, inkludert generering av tatoveringsstencil. Når du velger AI-stencilgenerering, sender vi referansebildet du laster opp og din valgte stilpreferanse til Netlify, som videresender forespørselen til Googles Gemini-bildemodell via Netlify AI Gateway. Behandlingen er knyttet til din innloggede konto, underlagt bruksgrenser per konto, og brukes kun til å generere stencilen du ba om.",
      p2: "AI-genererte stencilforhåndsvisninger lagres i fillagringen vår i opptil 24 timer og slettes deretter automatisk. Vi bruker ikke referansebildene dine eller AI-utdata til å trene egne modeller, og vi selger ikke dette innholdet til tredjeparter. Googles og Netlifys vilkår og personvernregler gjelder for deres behandling. Ikke last opp bilder du ikke har rett til å bruke, eller innhold med unødvendige personopplysninger eller særlige kategorier av data.",
      p3: "Valgfri telefonsupport for Velbok-plattformen kan bruke tredjeparts tale-AI (Vapi). Samtalemetadata og transkripsjoner kan logges for kvalitet og support, som beskrevet i avsnittet om tjenesteleverandører.",
    },
    subprocessorsP1:
      "Vi bruker pålitelige leverandører for å drive Velbok, inkludert: Supabase (autentisering, database, fillagring, edge-funksjoner), Stripe (betalinger, Connect-utbetalinger, Terminal / Tap to Pay), Resend (transaksjonse-post), Twilio (valgfritt WhatsApp/SMS per studio), Netlify (nettstedshosting og AI Gateway for stencilgenerering via Google Gemini) og Vapi (valgfri plattformstalesupport). Hver leverandør behandler data under kontrakt og sine egne personvernregler.",
    contractDesc:
      "levering av Velbok-tjenesten, studioabonnementer, bestillinger, depositum, fakturaer og AI-stencilverktøy aktivert på planen din.",
    howUseP1:
      "Vi bruker personopplysninger til å drive Velbok, autentisere brukere, behandle studioabonnementer og kundebetalinger, levere varsler og AI-funksjoner aktivert på planen din, støtte studioer, forbedre pålitelighet og oppfylle juridiske forpliktelser.",
    acceptableUseP2:
      "Du må ikke sende inn ulovlige, krenkende eller unødvendig sensitive personopplysninger via AI-funksjoner.",
    dataProcessingP3:
      "Når du bruker AI-funksjoner (som stencilgenerering), instruerer du oss om å behandle opplastede referansebilder via tredjeparts-AI-leverandører utelukkende for å levere den funksjonen, som beskrevet i personvernerklæringen vår. Du er ansvarlig for å ha rettigheter til alt innhold du sender inn og at innsendinger følger gjeldende lov.",
    thirdPartyP1:
      "Tjenesten integrerer tredjeparter som Stripe (betalinger), Supabase (hosting), e-postleverandører, Netlify AI Gateway med Google Gemini (AI-stencilgenerering) og Vapi (valgfri plattformstalesupport). Deres vilkår og personvernregler gjelder for tjenestene deres. Vi er ikke ansvarlige for avbrudd, feil eller handlinger fra tredjepartsleverandører utenfor vår rimelige kontroll.",
    thirdPartyP2:
      "Tredjeparts-AI-leverandører behandler data kun for å levere den forespurte funksjonen. Vi krever at slik behandling er begrenset til å levere Tjenesten og ikke brukes til å trene modeller på innholdet ditt for leverandørens urelaterte formål, med forbehold om hver leverandørs retningslinjer.",
    disclaimerP2:
      "AI-genererte utdata (som stenciler) gis kun som designhjelp. Utdata kan være ufullkomne; du er ansvarlig for å gjennomgå dem før bruk på kunder.",
  },
  ro: {
    whenCollectP1:
      "Colectăm date când creați un cont, vă abonați la Velbok, configurați un studio, gestionați rezervări sau facturare, completați formulare de consimțământ, folosiți mesageria din aplicație, folosiți instrumentele de șabloane IA, contactați suportul sau folosiți funcțiile de plată pe web sau mobil.",
    ai: {
      title: "Funcții IA și prelucrare prin furnizori IA terți",
      p1: "Velbok oferă instrumente opționale bazate pe IA, inclusiv generarea de șabloane pentru tatuaje. Când alegeți generarea de șabloane IA, trimitem imaginea de referință încărcată și preferința de stil selectată către Netlify, care direcționează cererea către modelul de imagine Gemini de la Google prin Netlify AI Gateway. Prelucrarea este legată de contul dvs. conectat, supusă limitelor de utilizare per cont, și este folosită doar pentru a genera șablonul solicitat.",
      p2: "Previzualizările de șabloane generate de IA sunt stocate în spațiul nostru de fișiere până la 24 de ore, apoi șterse automat. Nu folosim imaginile de referință sau ieșirile IA pentru a antrena propriile modele și nu vindem acest conținut către terți. Se aplică termenii și politicile de confidențialitate ale Google și Netlify. Nu încărcați imagini pe care nu aveți dreptul să le folosiți sau conținut cu date personale sau categorii speciale inutile.",
      p3: "Suportul telefonic opțional al platformei Velbok poate folosi IA vocală terță (Vapi). Metadatele apelurilor și transcrierile pot fi înregistrate pentru calitate și suport, conform secțiunii despre furnizorii de servicii.",
    },
    subprocessorsP1:
      "Folosim furnizori de încredere pentru a opera Velbok, inclusiv: Supabase (autentificare, bază de date, stocare fișiere, funcții edge), Stripe (plăți, plăți Connect, Terminal / Tap to Pay), Resend (e-mail tranzacțional), Twilio (WhatsApp/SMS opțional per studio), Netlify (găzduire site și AI Gateway pentru generarea de șabloane prin Google Gemini) și Vapi (suport vocal opțional al platformei). Fiecare furnizor prelucrează date în baza unui contract și a propriilor termeni de confidențialitate.",
    contractDesc:
      "furnizarea serviciului Velbok, abonamente studio, rezervări, avansuri, facturi și instrumente de șabloane IA activate pe planul dvs.",
    howUseP1:
      "Folosim datele personale pentru a opera Velbok, a autentifica utilizatorii, a procesa abonamentele studio și plățile clienților, a livra notificări și funcții IA activate pe planul dvs., a sprijini studiourile, a îmbunătăți fiabilitatea și a respecta obligațiile legale.",
    acceptableUseP2:
      "Nu trebuie să trimiteți prin funcțiile IA date personale ilicite, care încalcă drepturi sau inutil de sensibile.",
    dataProcessingP3:
      "Când folosiți funcții IA (cum ar fi generarea de șabloane), ne instruiți să prelucrăm imaginile de referință încărcate prin furnizori IA terți exclusiv pentru a furniza acea funcție, conform Notei noastre de confidențialitate. Sunteți responsabil să aveți drepturi asupra conținutului trimis și ca trimiterile să respecte legea aplicabilă.",
    thirdPartyP1:
      "Serviciul integrează terți precum Stripe (plăți), Supabase (găzduire), furnizori de e-mail, Netlify AI Gateway cu Google Gemini (generare șabloane IA) și Vapi (suport vocal opțional al platformei). Termenii și politicile lor de confidențialitate se aplică serviciilor lor. Nu suntem răspunzători pentru întreruperi, erori sau acte ale furnizorilor terți în afara controlului nostru rezonabil.",
    thirdPartyP2:
      "Furnizorii IA terți prelucrează date doar pentru a furniza funcția solicitată. Cerem ca această prelucrare să fie limitată la livrarea Serviciului și să nu fie folosită pentru antrenarea modelelor pe conținutul dvs. în scopuri nelegate ale furnizorului, sub rezerva politicilor fiecărui furnizor.",
    disclaimerP2:
      "Ieșirile generate de IA (cum ar fi șabloanele) sunt oferite doar ca asistență de design. Ieșirile pot fi imperfecte; sunteți responsabil să le revizuiți înainte de utilizarea pe clienți.",
  },
  bg: {
    whenCollectP1:
      "Събираме данни, когато създавате акаунт, абонирате се за Velbok, конфигурирате студио, управлявате резервации или фактуриране, попълвате формуляри за съгласие, използвате съобщения в приложението, използвате AI инструменти за шаблони, свързвате се с поддръжката или използвате платежни функции в уеб или мобилно приложение.",
    ai: {
      title: "AI функции и обработка чрез трети AI доставчици",
      p1: "Velbok предлага опционални AI инструменти, включително генериране на тату шаблони. Когато изберете AI генериране на шаблон, изпращаме каченото от вас референтно изображение и избраната стилова предпочитание към Netlify, който насочва заявката към модела за изображения Gemini на Google чрез Netlify AI Gateway. Обработката е свързана с влезлия ви акаунт, подлежи на лимити за използване на акаунта и се използва само за генериране на поискания шаблон.",
      p2: "AI генерираните визуализации на шаблони се съхраняват в нашето файлово хранилище до 24 часа и след това се изтриват автоматично. Не използваме вашите референтни изображения или AI изходи за обучение на собствени модели и не продаваме това съдържание на трети страни. Прилагат се условията и политиките за поверителност на Google и Netlify. Не качвайте изображения, за които нямате право да ги използвате, или съдържание с ненужни лични данни или специални категории данни.",
      p3: "Опционалната телефонна поддръжка на платформата Velbok може да използва гласов AI на трети страни (Vapi). Метаданните от обажданията и транскрипциите могат да се записват за качество и поддръжка, както е описано в нашия раздел за доставчици на услуги.",
    },
    subprocessorsP1:
      "Използваме доверени доставчици за работата на Velbok, включително: Supabase (удостоверяване, база данни, файлово съхранение, edge функции), Stripe (плащания, Connect изплащания, Terminal / Tap to Pay), Resend (транзакционен имейл), Twilio (по избор WhatsApp/SMS за студио), Netlify (уеб хостинг и AI Gateway за генериране на шаблони чрез Google Gemini) и Vapi (по избор гласова поддръжка на платформата). Всеки доставчик обработва данни по договор и според собствените си условия за поверителност.",
    contractDesc:
      "предоставяне на услугата Velbok, студийни абонаменти, резервации, депозити, фактури и AI инструменти за шаблони, активирани във вашия план.",
    howUseP1:
      "Използваме лични данни за работа на Velbok, удостоверяване на потребители, обработка на студийни абонаменти и клиентски плащания, доставяне на известия и AI функции, активирани във вашия план, подкрепа на студия, подобряване на надеждността и спазване на правни задължения.",
    acceptableUseP2:
      "Не трябва да изпращате чрез AI функции незаконни, нарушаващи права или ненужно чувствителни лични данни.",
    dataProcessingP3:
      "Когато използвате AI функции (като генериране на шаблони), ни инструктирате да обработваме качените референтни изображения чрез трети AI доставчици единствено за предоставяне на тази функция, както е описано в нашето Уведомление за поверителност. Вие носите отговорност да имате права върху подаденото съдържание и подаванията да съответстват на приложимото право.",
    thirdPartyP1:
      "Услугата интегрира трети страни като Stripe (плащания), Supabase (хостинг), имейл доставчици, Netlify AI Gateway с Google Gemini (AI генериране на шаблони) и Vapi (по избор гласова поддръжка на платформата). Техните условия и политики за поверителност се прилагат за техните услуги. Не носим отговорност за прекъсвания, грешки или действия на трети доставчици извън нашия разумен контрол.",
    thirdPartyP2:
      "Третите AI доставчици обработват данни само за предоставяне на поисканата функция. Изискваме такава обработка да е ограничена до предоставяне на Услугата и да не се използва за обучение на модели върху вашето съдържание за несвързани цели на доставчика, при спазване на политиките на всеки доставчик.",
    disclaimerP2:
      "AI генерираните изходи (като шаблони) се предоставят само като помощ при дизайна. Изходите може да са несъвършени; вие носите отговорност да ги прегледате преди използване при клиенти.",
  },
};

for (const lang of langs) {
  const filePath = path.join(root, "src/i18n/legal-translations", `${lang}.json`);
  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const c = COPY[lang];

  data.legal.privacy.lastUpdated = LAST_UPDATED[lang];
  data.legal.terms.lastUpdated = LAST_UPDATED[lang];
  data.legal.privacy.sections.whenCollect.p1 = c.whenCollectP1;
  data.legal.privacy.sections.ai = c.ai;
  data.legal.privacy.sections.subprocessors.p1 = c.subprocessorsP1;
  data.legal.privacy.sections.lawfulBases.contractDesc = c.contractDesc;
  data.legal.privacy.sections.howUse.p1 = c.howUseP1;
  data.legal.terms.sections.acceptableUse.p2 = c.acceptableUseP2;
  data.legal.terms.sections.dataProcessing.p3 = c.dataProcessingP3;
  data.legal.terms.sections.thirdParty.p1 = c.thirdPartyP1;
  data.legal.terms.sections.thirdParty.p2 = c.thirdPartyP2;
  data.legal.terms.sections.disclaimer.p2 = c.disclaimerP2;

  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
  console.log(`Updated legal-translations/${lang}.json`);
}

console.log("Done. Run: node scripts/sync-legal-locales.mjs");
