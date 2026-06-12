import { readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sourcePath = join(__dirname, "_patch-source-no-remaining.json");
const svPatchPath = join(__dirname, "locale-sv-remaining-patch.json");
const outPath = join(__dirname, "locale-no-remaining-patch.json");

/** Swedish → Norwegian Bokmål adaptations for keys covered by sv patch */
const SV_TO_NO = [
  [/Handpenning/g, "Depositum"],
  [/handpenning/g, "depositum"],
  [/Handpennings/g, "Depositums"],
  [/handpennings/g, "depositums"],
  [/Instrumentpanel/g, "Dashbord"],
  [/instrumentpanel/g, "dashbord"],
  [/Schemalägg/g, "Planlegg"],
  [/schemat/g, "timeplanen"],
  [/Schemat/g, "Timeplanen"],
  [/schemasidan/g, "timeplansiden"],
  [/schema/g, "timeplan"],
  [/Schema/g, "Timeplan"],
  [/mejl/g, "e-post"],
  [/Mejl/g, "E-post"],
  [/Ladda upp/g, "Last opp"],
  [/ladda upp/g, "last opp"],
  [/Ladda ner/g, "Last ned"],
  [/ladda ner/g, "last ned"],
  [/Tillbaka/g, "Tilbaka"],
  [/Fortsätt/g, "Fortsett"],
  [/Slutför/g, "Fullfør"],
  [/slutför/g, "fullfør"],
  [/Konfigurera/g, "Sett opp"],
  [/konfigurera/g, "sett opp"],
  [/Granska/g, "Gjennomgå"],
  [/granska/g, "gjennomgå"],
  [/Ange/g, "Angi"],
  [/ange/g, "angi"],
  [/Kunde inte/g, "Kunne ikke"],
  [/kunde inte/g, "kunne ikke"],
  [/Stäng/g, "Lukk"],
  [/stäng/g, "lukk"],
  [/Öppna/g, "Åpne"],
  [/öppna/g, "åpne"],
  [/Radera/g, "Slett"],
  [/radera/g, "slett"],
  [/Spara/g, "Lagre"],
  [/spara/g, "lagre"],
  [/Sök/g, "Søk"],
  [/sök/g, "søk"],
  [/Visar/g, "Viser"],
  [/visar/g, "viser"],
  [/Skicka/g, "Send"],
  [/skicka/g, "send"],
  [/Redigera/g, "Rediger"],
  [/redigera/g, "rediger"],
  [/Lägg till/g, "Legg til"],
  [/lägg till/g, "legg til"],
  [/Ta bort/g, "Fjern"],
  [/ta bort/g, "fjern"],
  [/Kopiera/g, "Kopier"],
  [/kopiera/g, "kopier"],
  [/Förhandsgranska/g, "Forhåndsvis"],
  [/förhandsgranska/g, "forhåndsvis"],
  [/Välj/g, "Velg"],
  [/välj/g, "velg"],
  [/välkommen/g, "velkommen"],
  [/Inställningar/g, "Innstillinger"],
  [/inställningar/g, "innstillinger"],
  [/Prenumeration/g, "Abonnement"],
  [/prenumeration/g, "abonnement"],
  [/Arbetstider/g, "Arbeidstider"],
  [/arbetstider/g, "arbeidstider"],
  [/Eftervård/g, "Etterbehandling"],
  [/eftervård/g, "etterbehandling"],
  [/Eftervårds/g, "Etterbehandlings"],
  [/eftervårds/g, "etterbehandlings"],
  [/Samtyckesformulär/g, "Samtykkeskjema"],
  [/samtyckesformulär/g, "samtykkeskjema"],
  [/Tatuering/g, "Tatovering"],
  [/tatuering/g, "tatovering"],
  [/artister/g, "artister"],
  [/studion/g, "studioet"],
  [/Studion/g, "Studioet"],
  [/Er studio/g, "Studioet ditt"],
  [/er studio/g, "studioet ditt"],
  [/ert team/g, "teamet ditt"],
  [/Ert team/g, "Teamet ditt"],
  [/era kunder/g, "kundene dine"],
  [/Era kunder/g, "Kundene dine"],
  [/ni /g, "dere "],
  [/Ni /g, "Dere "],
  [/ert /g, "deres "],
  [/Ert /g, "Deres "],
  [/Försök igen/g, "Prøv igjen"],
  [/försök igen/g, "prøv igjen"],
  [/timme 30/g, "time 30"],
  [/timmar/g, "timer"],
  [/timme/g, "time"],
  [/sedan/g, "siden"],
  [/Just nu/g, "Akkurat nå"],
  [/Befintliga/g, "Eksisterende"],
  [/befintliga/g, "eksisterende"],
  [/Inga /g, "Ingen "],
  [/inga /g, "ingen "],
  [/Alla /g, "Alle "],
  [/alla /g, "alle "],
  [/Styr /g, "Styr "],
  [/styr /g, "styr "],
  [/Webbinloggning/g, "Nettinnlogging"],
  [/webbinloggning/g, "nettinnlogging"],
  [/Webbplats/g, "Nettsted"],
  [/webbplats/g, "nettsted"],
  [/personligappen/g, "personalappen"],
  [/Personalappen/g, "Personalappen"],
  [/personligappens/g, "personalappens"],
  [/Personalappens/g, "Personalappens"],
  [/Besök/g, "Avtale"],
  [/besök/g, "avtale"],
  [/bokning/g, "booking"],
  [/Bokning/g, "Booking"],
  [/bokningar/g, "bookinger"],
  [/Bokningar/g, "Bookinger"],
  [/kund/g, "kunde"],
  [/Kund/g, "Kunde"],
  [/kunder/g, "kunder"],
  [/Kunder/g, "Kunder"],
  [/personlig/g, "personal"],
  [/Personlig/g, "Personal"],
  [/filtr/g, "filtr"], // unchanged
  [/…/g, "…"],
  [/\.\.\./g, "…"],
  [/Studioinställning/g, "Studiooppsett"],
  [/Handelsnamn/g, "Handelsnavn"],
  [/Postnummer/g, "Postnummer"],
  [/Support-e-post/g, "Support-e-post"],
  [/Nedgradera/g, "Nedgrader"],
  [/För många/g, "For mange"],
  [/Byt plan/g, "Bytt plan"],
  [/Nuvarande/g, "Nåværende"],
  [/Uppdaterad/g, "Oppdatert"],
  [/uppdaterad/g, "oppdatert"],
  [/Skicka via/g, "Send via"],
  [/Misslyckades/g, "Mislyktes"],
  [/misslyckades/g, "mislyktes"],
  [/Ogiltig/g, "Ugyldig"],
  [/ogiltig/g, "ugyldig"],
  [/Exportera/g, "Eksporter"],
  [/exportera/g, "eksporter"],
  [/Importera/g, "Importer"],
  [/importera/g, "importer"],
  [/Återställ/g, "Tilbakestill"],
  [/återställ/g, "tilbakestill"],
  [/Standardvärden/g, "Standardverdier"],
  [/standardvärden/g, "standardverdier"],
  [/Inbjudan/g, "Invitasjon"],
  [/inbjudan/g, "invitasjon"],
  [/Einladung/g, "Invitasjon"], // fallback
  [/ och /g, " og "],
  [/Och /g, "Og "],
  [/ att /g, " at "],
  [/Att /g, "At "],
  [/ för /g, " for "],
  [/För /g, "For "],
  [/deres /g, "ditt "],
  [/Deres /g, "Ditt "],
  [/dere /g, "du "],
  [/Dere /g, "Du "],
  [/kundeer/g, "kunder"],
  [/studioetamn/g, "studionavn"],
  [/Studioetamn/g, "Studionavn"],
  [/logotyp/g, "logo"],
  [/Logotyp/g, "Logo"],
  [/uppladdad/g, "lastet opp"],
  [/Stad/g, "By"],
  [/stad/g, "by"],
  [/Adressrad/g, "Adresselinje"],
  [/adressrad/g, "adresselinje"],
  [/Varumärke/g, "Merkevare"],
  [/varumärke/g, "merkevare"],
  [/Företagets/g, "Selskapets"],
  [/företagets/g, "selskapets"],
  [/Faktureringsföretag/g, "Faktureringsselskap"],
  [/öppettider/g, "åpningstider"],
  [/Öppettider/g, "Åpningstider"],
  [/rutnät/g, "rutenett"],
  [/Bekräfta/g, "Bekreft"],
  [/bekräfta/g, "bekreft"],
  [/börjar/g, "begynner"],
  [/Börjar/g, "Begynner"],
  [/är redo/g, "er klart"],
  [/ändra/g, "endre"],
  [/Ändra/g, "Endre"],
  [/använder/g, "bruker"],
  [/Använder/g, "Bruker"],
  [/fortfarande/g, "fortsatt"],
  [/Fortfarande/g, "Fortsatt"],
  [/rediger/g, "rediger"],
  [/biografi/g, "bio"],
  [/kontaktuppgifter/g, "kontaktdetaljer"],
  [/Nedgslett/g, "Nedgrader"],
  [/byta/g, "bytte"],
  [/redan/g, "allerede"],
  [/denna/g, "denne"],
  [/nu /g, "nå "],
  [/Nu /g, "Nå "],
  [/behöver/g, "trenger"],
  [/Behöver/g, "Trenger"],
  [/installationen/g, "oppsettet"],
  [/dessa /g, "disse "],
  [/Dessa /g, "Disse "],
  [/steg /g, "trinn "],
  [/rätt /g, "riktig "],
  [/Rätt /g, "Riktig "],
  [/information/g, "informasjon"],
  [/når er/g, "når dere"],
  [/på kundesidor/g, "på kundesidene"],
  [/Hur /g, "Hvordan "],
  [/hur /g, "hvordan "],
  [/finns/g, "holder til"],
  [/Finns/g, "Holder til"],
  [/utifrån/g, "ut fra"],
  [/Utifrån/g, "Ut fra "],
  [/plats/g, "posisjon"],
  [/Plats/g, "Posisjon"],
  [/ligger någon annanstans/g, "ligger et annet sted"],
  [/Detta är/g, "Dette er"],
  [/detta är/g, "dette er"],
  [/lägga till/g, "legge til"],
  [/Lägg till/g, "Legg til"],
  [/fullständiga/g, "fullstendige"],
  [/faktureringsuppgifter/g, "faktureringsdetaljer"],
  [/juridiska/g, "juridiske"],
  [/Juridiska/g, "Juridiske"],
  [/företagsuppgifter/g, "selskapsopplysninger"],
  [/används/g, "brukes"],
  [/Används/g, "Brukes"],
  [/kvitton/g, "kvitteringer"],
];

function svToNo(sv) {
  let out = sv;
  for (const [re, rep] of SV_TO_NO) out = out.replace(re, rep);
  return out;
}

function polishNo(text) {
  return text
    .replace(/\.\.\./g, "…")
    .replace(/\bLoading…\b/g, "Laster…")
    .replace(/\bSaving…\b/g, "Lagrer…")
    .replace(/\bUploading…\b/g, "Laster opp…")
    .replace(/\bSearching…\b/g, "Søker…")
    .replace(/\bDeleting…\b/g, "Sletter…")
    .replace(/\bCreating…\b/g, "Oppretter…")
    .replace(/\bSending…\b/g, "Sender…")
    .replace(/\bDownloading…\b/g, "Laster ned…")
    .replace(/\bChecking…\b/g, "Sjekker…")
    .replace(/\bGenerating…\b/g, "Genererer…")
    .replace(/\bFinishing…\b/g, "Fullfører…")
    .replace(/\bRedirecting…\b/g, "Omdirigerer…")
    .replace(/\bUpdating…\b/g, "Oppdaterer…");
}

/** Hand-crafted Norwegian translations keyed by English source string */
const EN_TO_NO = {
  "Booking": "Booking",
  "Artist": "Artist",
  "Shop setup": "Studiooppsett",
  "Set up your studio": "Sett opp studioet ditt",
  "Complete these steps so your team and customers see the right shop details, billing, and schedule.":
    "Fullfør disse trinnene slik at teamet og kundene dine ser riktige studiodetaljer, fakturering og timeplan.",
  "Brand & name": "Merkevare og navn",
  "Your studio name and logo appear across the staff app and customer pages.":
    "Studionavnet og logoen vises i personalappen og på kundesidene.",
  "Contact & address": "Kontakt og adresse",
  "How clients reach you and where you are located.":
    "Hvordan kunder når deg og hvor du holder til.",
  "Billing company": "Faktureringsselskap",
  "Legal company details used on invoices and receipts.":
    "Juridiske selskapsopplysninger brukt på fakturaer og kvitteringer.",
  "Working hours": "Arbeidstider",
  "Default open hours for your schedule grid.":
    "Standard åpningstider for timeplanrutenettet ditt.",
  "Dashboard look": "Dashbordutseende",
  "Choose how the staff app theme works for your team.":
    "Velg hvordan personalappens tema skal fungere for teamet ditt.",
  "Review & finish": "Gjennomgå og fullfør",
  "Confirm everything looks right before you start booking.":
    "Bekreft at alt ser riktig ut før du begynner å booke.",
  "Shop name": "Studionavn",
  "Trading name": "Handelsnavn",
  "Logo": "Logo",
  "Upload logo": "Last opp logo",
  "Logo uploaded": "Logo lastet opp",
  "Support email": "Support-e-post",
  "Website": "Nettsted",
  "Address line 1": "Adresselinje 1",
  "Address line 2": "Adresselinje 2",
  "City": "By",
  "Postcode": "Postnummer",
  "Country": "Land",
  "Client deposits and card invoices will be charged in {{currency}}.":
    "Kundedepositum og kortfakturaer belastes i {{currency}}.",
  "Country suggested from your location — change if your studio is elsewhere.":
    "Land foreslått ut fra posisjonen din — endre hvis studioet ditt ligger et annet sted.",
  "Company display name": "Selskapets visningsnavn",
  "Company legal name": "Selskapets juridiske navn",
  "This is the legal entity shown on invoices. You can add full billing details later in Settings.":
    "Dette er den juridiske enheten som vises på fakturaer. Du kan legge til fullstendige faktureringsdetaljer senere under Innstillinger.",
  "Please enter your shop name.": "Angi studionavnet ditt.",
  "Please enter your company legal name.": "Angi selskapets juridiske navn.",
  "Back": "Tilbake",
  "Continue": "Fortsett",
  "Finish setup": "Fullfør oppsett",
  "Finishing…": "Fullfører…",
  "Your studio is ready — welcome to Velbok!":
    "Studioet ditt er klart — velkommen til Velbok!",
  "You can change any of these later in Admin and Settings.":
    "Du kan endre alt dette senere under Admin og Innstillinger.",
  "Downgrade to {{plan}}": "Nedgrader til {{plan}}",
  "Too many artists": "For mange artister",
  "Change plan": "Bytt plan",
  "All plans include the same features. Choose based on how many artists you need.":
    "Alle planer inkluderer de samme funksjonene. Velg ut fra hvor mange artister du trenger.",
  "Current": "Nåværende",
  "Plan updated": "Plan oppdatert",
  "You are now on the {{plan}} plan.": "Du er nå på {{plan}}-planen.",
  "Could not change plan": "Kunne ikke bytte plan",
  "You are already on this plan": "Du har allerede denne planen",
  "Your shop uses one shared dashboard look set by the admin. You can still edit your name, bio and contact details.":
    "Studioet ditt bruker ett felles dashbordutseende satt av admin. Du kan fortsatt redigere navn, bio og kontaktdetaljer.",
  "Send via": "Send via",
  "Failed to update permission": "Kunne ikke oppdatere tillatelse",
  "Granted {{feature}}": "Gitt {{feature}}",
  "Revoked {{feature}}": "Tilbakekalt {{feature}}",
  "Failed to update permissions": "Kunne ikke oppdatere tillatelser",
  "Granted all staff features": "Gitt alle personalfunksjoner",
  "Revoked all staff features": "Tilbakekalt alle personalfunksjoner",
  "Failed to save default": "Kunne ikke lagre standard",
  "Default updated - applies to new invites only":
    "Standard oppdatert – gjelder bare nye invitasjoner",
  "Enter a valid email": "Angi en gyldig e-postadresse",
  "Invite failed": "Invitasjon mislyktes",
  "Schedule admin tools": "Timeplan-adminverktøy",
  "Import, export, or reset schedule data":
    "Importer, eksporter eller tilbakestill timeplandata",
  "Export JSON": "Eksporter JSON",
  "Export CSV": "Eksporter CSV",
  "Import": "Importer",
  "Reset schedule": "Tilbakestill timeplan",
  "New-user defaults": "Standarder for nye brukere",
  "Staff matrix": "Personalmatrise",
  "Customers": "Kunder",
  "Consents": "Samtykker",
  "Emails": "E-poster",
  "Control booking confirmations, deposit reminders, appointment reminders, and notification channels for the whole studio. Artists cannot change these settings.":
    "Styr bookingbekreftelser, depositumpåminnelser, avtalepåminnelser og varslingskanaler for hele studioet. Artister kan ikke endre disse innstillingene.",
  "Shop email preferences are saved for all artists.":
    "Studioets e-postinnstillinger lagres for alle artister.",
  "Aftercare": "Etterbehandling",
  "Schedule working hours": "Planlegg arbeidstider",
  "Set when your shop is open on the calendar. The schedule uses 15-minute slots. Extra buffer time appears dimmed but can still be booked.":
    "Angi når studioet er åpent i kalenderen. Timeplanen bruker 15-minutters tidsluker. Ekstra buffertid vises nedtonet, men kan fortsatt bookes.",
  "Shop opens": "Studioet åpner",
  "Shop closes": "Studioet stenger",
  "Extra time slot": "Ekstra tidsluke",
  "Place extra time": "Plasser ekstra tid",
  "None": "Ingen",
  "30 minutes": "30 minutter",
  "1 hour": "1 time",
  "1 hour 30": "1 time 30",
  "2 hours": "2 timer",
  "Before opening": "Før åpning",
  "After closing": "Etter stenging",
  "Before opening and after closing": "Før åpning og etter stenging",
  "The schedule grid will show {{slots}} rows ({{minutes}} min each) including buffer time.":
    "Timeplanrutenettet viser {{slots}} rader ({{minutes}} min hver) inkludert buffertid.",
  "Working hours updated — refresh the schedule page to see changes.":
    "Arbeidstider oppdatert — oppdater timeplansiden for å se endringene.",
  "Subscription": "Abonnement",
  "Dashboard & staff app look": "Dashbord og personalappens utseende",
  "Choose whether each artist picks their own colors and background, or one shared theme for the whole shop (schedule, dashboard, settings, etc.).":
    "Velg om hver artist velger egne farger og bakgrunn, eller ett felles tema for hele studioet (timeplan, dashbord, innstillinger osv.).",
  "Customization mode": "Tilpasningsmodus",
  "Each artist customizes their own": "Hver artist tilpasser sitt eget",
  "One look for the whole shop": "Ett utseende for hele studioet",
  "Artists set colors and background under Settings → Profile customization.":
    "Artister setter farger og bakgrunn under Innstillinger → Profiltilpasning.",
  "All staff see the same background and accent colors. Artists cannot change the staff app theme.":
    "Alt personale ser samme bakgrunn og aksentfarger. Artister kan ikke endre personalappens tema.",
  "Shop-wide theme": "Studioomfattende tema",
  "Preset themes": "Forhåndsinnstilte temaer",
  "Custom color": "Egendefinert farge",
  "Background image": "Bakgrunnsbilde",
  "Upload background image": "Last opp bakgrunnsbilde",
  "Remove image": "Fjern bilde",
  "Background image uploaded": "Bakgrunnsbilde lastet opp",
  "Dashboard theme updated for all staff.":
    "Dashbordtema oppdatert for alt personale.",
  "Aftercare emails": "Etterbehandlings-e-poster",
  "Edit the tattoo and piercing aftercare guides sent to clients when their appointment starts. Use the built-in Velbok defaults as a starting point.":
    "Rediger tatoverings- og piercing-etterbehandlingsguider som sendes til kunder når avtalen starter. Bruk de innebygde Velbok-standardene som utgangspunkt.",
  "Tattoo": "Tatovering",
  "Piercing": "Piercing",
  "Send this aftercare email": "Send denne etterbehandlings-e-posten",
  "Email badge": "E-postmerke",
  "Email subject (before studio name)": "E-postemne (før studionavn)",
  "Guide title": "Guidetittel",
  "Introduction": "Innledning",
  "Use {{shopName}} and {{bookingWindow}} where the studio name and appointment time should appear.":
    "Bruk {{shopName}} og {{bookingWindow}} der studionavn og avtaletid skal vises.",
  "Sections": "Seksjoner",
  "Add section": "Legg til seksjon",
  "Bullet list": "Punktliste",
  "Numbered list": "Nummerert liste",
  "Add bullet": "Legg til punkt",
  "Paragraph HTML (for non-list sections)":
    "Avsnitt-HTML (for seksjoner som ikke er lister)",
  "Reset to defaults": "Tilbakestill til standard",
  "Reset this guide to the original Velbok default content?":
    "Tilbakestille denne guiden til det opprinnelige Velbok-standardinnholdet?",
  "Restored default aftercare guide": "Standard etterbehandlingsguide gjenopprettet",
  "Aftercare guide saved for your studio.":
    "Etterbehandlingsguide lagret for studioet ditt.",
  "Emails are sent automatically near appointment start (every 15 minutes) when enabled and email is configured in Supabase.":
    "E-poster sendes automatisk nær avtalestart (hvert 15. minutt) når aktivert og e-post er konfigurert i Supabase.",
  "Consent forms": "Samtykkeskjemaer",
  "Consent form templates": "Maler for samtykkeskjemaer",
  "Edit tattoo and piercing waivers or add new forms (e.g. laser, PMU). Clients use the public link or the form matched to their booking type.":
    "Rediger tatoverings- og piercingfraskrivelser eller legg til nye skjemaer (f.eks. laser, PMU). Kunder bruker den offentlige lenken eller skjemaet som matcher bookingtypen.",
  "Add form": "Legg til skjema",
  "Edit": "Rediger",
  "Copy link": "Kopier lenke",
  "Active": "Aktiv",
  "Inactive": "Inaktiv",
  "Version {{version}}": "Versjon {{version}}",
  "All forms": "Alle skjemaer",
  "Form name": "Skjemanavn",
  "URL slug": "URL-slug",
  "Version": "Versjon",
  "Default for booking type": "Standard for bookingtype",
  "Manual link only": "Bare manuell lenke",
  "Form active": "Skjema aktivt",
  "Client page title": "Kundesidetittel",
  "PDF header title": "PDF-overskrift",
  "Opening declaration (PDF & form)": "Innledende erklæring (PDF og skjema)",
  "Treatment location field label": "Feltetikett for behandlingssted",
  "Statement columns on PDF": "Påstandskolonner i PDF",
  "Health questions": "Helsespørsmål",
  "Add question": "Legg til spørsmål",
  "Legal statements": "Juridiske påstander",
  "Add statement": "Legg til påstand",
  "Checkbox labels (client form)": "Avkrysningsboksetiketter (kundeskjema)",
  "Consent form saved.": "Samtykkeskjema lagret.",
  "Enter a form name or slug": "Angi et skjemanavn eller slug",
  "Tattoo and piercing forms cannot be deleted — deactivate them instead.":
    "Tatoverings- og piercingskjemaer kan ikke slettes — deaktiver dem i stedet.",
  'Delete "{{name}}"? Existing signed PDFs are kept.':
    'Slette «{{name}}»? Eksisterende signerte PDF-er beholdes.',
  "Form deleted": "Skjema slettet",
  "Share with clients as /consent?form=slug":
    "Del med kunder som /consent?form=slug",
  "No forms yet — defaults will appear when you open this tab.":
    "Ingen skjemaer ennå — standarder vises når du åpner denne fanen.",
  "Defaults apply when someone accepts an invite as Customer or Artist. Existing users are unchanged.":
    "Standarder gjelder når noen godtar en invitasjon som Kunde eller Artist. Eksisterende brukere er uendret.",
  "Customer defaults": "Kundestandarder",
  "Artist defaults": "Artiststandarder",
  "nav": "navigasjon",
  "Staff feature access": "Tilgang til personalfunksjoner",
  "Remove": "Fjern",
  "Remove {{name}} from this shop? They will lose artist access and staff permissions.":
    "Fjerne {{name}} fra dette studioet? Vedkommende mister artisttilgang og personaltillatelser.",
  " They will keep shop admin access.":
    " Vedkommende beholder studioadmin-tilgang.",
  "{{name}} was removed from the shop.":
    "{{name}} ble fjernet fra studioet.",
  "{{name}} was removed as an artist but still has admin access.":
    "{{name}} ble fjernet som artist, men har fortsatt admin-tilgang.",
  "Could not remove artist": "Kunne ikke fjerne artist",
  "Website login": "Nettinnlogging",
  "Customer login embed": "Innebygd kundeinnlogging",
  "Copy HTML to paste on your studio website so clients can sign in to their customer portal (bookings, deposits, messages).":
    "Kopier HTML for å lime inn på studionettstedet slik at kunder kan logge inn i kundeportalen (bookinger, depositum, meldinger).",
  "Login button": "Innloggingsknapp",
  "Login form (iframe)": "Innloggingsskjema (iframe)",
  "Shows your shop name, a Login button, and Powered by Velbok. Opens the Velbok sign-in page in a new tab — works on any website.":
    "Viser studionavnet ditt, en innloggingsknapp og Powered by Velbok. Åpner Velbok-innloggingssiden i en ny fane — fungerer på alle nettsteder.",
  "Embeds email and password fields on your page via an iframe. Some website builders restrict iframes; use the Login button if needed.":
    "Bygger inn e-post- og passordfelt på siden din via en iframe. Noen nettstedsbyggere begrenser iframes; bruk innloggingsknappen ved behov.",
  "Copy button HTML": "Kopier knapp-HTML",
  "Copy iframe HTML": "Kopier iframe-HTML",
  "Embed code copied to clipboard": "Innebyggingskode kopiert til utklippstavlen",
  "Preview": "Forhåndsvis",
  "Customer login URL": "Kundeinnloggings-URL",
  "Powered by {{platform}}": "Powered by {{platform}}",
  "Open embed page": "Åpne innebyggingsside",
  "User": "Bruker",
  "All": "Alle",
  "Revoke": "Tilbakekall",
  "Grant all": "Gi alle",
  "Customer accounts": "Kundekontoer",
  "Portal access: bookings/profile and consent link":
    "Portaltilgang: bookinger/profil og samtykkelenke",
  'No customer-only accounts yet. Invite with "Customer".':
    'Ingen kontoer kun for kunder ennå. Inviter med «Kunde».',
  "My bookings": "Mine bookinger",
  "Loading…": "Laster…",
  "Invalid file": "Ugyldig fil",
  "Delete ALL bookings from schedule?": "Slette ALLE bookinger fra timeplanen?",
  "Schedule reset": "Timeplan tilbakestilt",
  "Exported {{count}} booking(s)": "Eksporterte {{count}} booking(er)",
  "Imported {{count}} booking(s)": "Importerte {{count}} booking(er)",
  "Customer": "Kunde",
  "Customer portal": "Kundeportal",
  "Deposit payment": "Depositumbetaling",
  "Messages": "Meldinger",
  "Sign consent": "Signer samtykke",
  "Sign out": "Logg ut",
  "Out": "Ut",
  "Menu": "Meny",
  "My account": "Min konto",
  "Your profile and appointments": "Profilen og avtalene dine",
  "Chat directly with your artist from your dashboard.":
    "Chat direkte med artisten din fra dashbordet.",
  "Open messages": "Åpne meldinger",
  "Secure your upcoming booking by paying the £50 deposit (not required for VIP appointments).":
    "Sikre den kommende bookingen din ved å betale £50-depositumet (ikke påkrevd for VIP-avtaler).",
  "App theme": "App-tema",
  "Choose light or dark mode for your account dashboard.":
    "Velg lys eller mørk modus for kontodashbordet ditt.",
  "Invoices": "Fakturaer",
  "Pay outstanding invoices securely online.":
    "Betal utestående fakturaer sikkert på nett.",
  "No invoices yet.": "Ingen fakturaer ennå.",
  "Due {{date}}": "Forfaller {{date}}",
  "No due date": "Ingen forfallsdato",
  "Paid": "Betalt",
  "Pay now": "Betal nå",
  "Redirecting...": "Omdirigerer…",
  "All invoices are paid.": "Alle fakturaer er betalt.",
  "Attendance score": "Oppmøtepoeng",
  "Manual reliability score managed by your artist.":
    "Manuelt pålitelighetspoeng administrert av artisten din.",
  "No-shows": "Uteblivelser",
  "Late cancellations": "Sene avbestillinger",
  "Reschedules": "Ombookinger",
  "Banned": "Utestengt",
  "Reason": "Årsak",
  "Profile": "Profil",
  "VIP client": "VIP-kunde",
  "Your full name and contact details - matches bookings when your email is on the appointment":
    "Fullt navn og kontaktdetaljer — matcher bookinger når e-posten din står på avtalen",
  "The studio has marked you as VIP on at least one booking.":
    "Studioet har merket deg som VIP på minst én booking.",
  "Locked to the invitation email for this account.":
    "Låst til invitasjons-e-posten for denne kontoen.",
  "Full name": "Fullt navn",
  "Save profile": "Lagre profil",
  "Upcoming": "Kommende",
  "No upcoming appointments. We'll show them here when your email is on a booking.":
    "Ingen kommende avtaler. Vi viser dem her når e-posten din står på en booking.",
  "Fill in consent form": "Fyll ut samtykkeskjema",
  "Past visits": "Tidligere besøk",
  "No past appointments yet.": "Ingen tidligere avtaler ennå.",
  "Security": "Sikkerhet",
  "Manage your account password.": "Administrer kontopassordet ditt.",
  "Change password": "Endre passord",
  "Use a strong password with at least 8 characters.":
    "Bruk et sterkt passord med minst 8 tegn.",
  "New password": "Nytt passord",
  "At least 8 chars, capital, number, symbol":
    "Minst 8 tegn, stor bokstav, tall, symbol",
  "Confirm new password": "Bekreft nytt passord",
  "Repeat new password": "Gjenta nytt passord",
  "Updating...": "Oppdaterer…",
  "Save password": "Lagre passord",
  "Use at least 8 characters with a capital letter, number, and symbol":
    "Bruk minst 8 tegn med stor bokstav, tall og symbol",
  "Set up your account": "Sett opp kontoen din",
  "Finish your invite by confirming your customer profile details.":
    "Fullfør invitasjonen ved å bekrefte kundeprofildetaljene dine.",
  "Create password": "Opprett passord",
  "Confirm password": "Bekreft passord",
  "Save & continue": "Lagre og fortsett",
  "Profile completed": "Profil fullført",
  "Could not save": "Kunne ikke lagre",
  "Please try again.": "Prøv igjen.",
  "Complete all required fields": "Fyll ut alle obligatoriske felt",
  "Full name, email, phone, and password are required.":
    "Fullt navn, e-post, telefon og passord er påkrevd.",
  "Password is too weak": "Passordet er for svakt",
  "Use at least 8 characters, with a capital letter, a number, and a symbol.":
    "Bruk minst 8 tegn, med stor bokstav, tall og symbol.",
  "Invite email is invalid": "Invitasjons-e-post er ugyldig",
  "Upcoming deposits": "Kommende depositum",
  "Only bookings with an unpaid deposit are shown here.":
    "Bare bookinger med ubetalt depositum vises her.",
  "No unpaid deposits right now.": "Ingen ubetalte depositum akkurat nå.",
  "Back to account": "Tilbake til konto",
  "Payment received. Confirming your deposit...":
    "Betaling mottatt. Bekrefter depositumet ditt…",
  "Deposit confirmed.": "Depositum bekreftet.",
  "Payment succeeded, but confirmation is still processing. This page will update automatically.":
    "Betalingen lyktes, men bekreftelsen behandles fortsatt. Denne siden oppdateres automatisk.",
  "Deposit payment cancelled.": "Depositumbetaling avbrutt.",
  "Could not load deposits": "Kunne ikke laste depositum",
  "Access limited": "Tilgang begrenset",
  "Your account doesn't include the bookings portal. Contact the studio if this is a mistake.":
    "Kontoen din inkluderer ikke bookingportalen. Kontakt studioet hvis dette er en feil.",
  "Profile updated": "Profil oppdatert",
  "Invoice payment received. Thank you.":
    "Fakturabetaling mottatt. Takk.",
  "Invoice payment cancelled.": "Fakturabetaling avbrutt.",
  "Type": "Type",
  "Start chat": "Start chat",
  "Signature line": "Signature line",
  "Fine line": "Fine line",
  "Dotwork": "Dotwork",
  "Blackwork": "Blackwork",
  "Original": "Original",
  "1 artist": "1 artist",
  "Book": "Book",
  "Artist *": "Artist *",
};

// Load remaining translations from part 2
const { EN_TO_NO_PART2 } = await import("./_no-translations-part2.mjs");

const source = JSON.parse(readFileSync(sourcePath, "utf8"));
const svPatch = JSON.parse(readFileSync(svPatchPath, "utf8"));
const sv = svPatch.sv ?? svPatch;

const allEnToNo = { ...EN_TO_NO, ...EN_TO_NO_PART2 };
const no = {};

for (const [key, en] of Object.entries(source)) {
  if (allEnToNo[en]) {
    no[key] = polishNo(allEnToNo[en]);
  } else if (sv[key]) {
    no[key] = polishNo(svToNo(sv[key]));
  } else {
    console.warn("MISSING:", key, "->", en);
    no[key] = en;
  }
}

writeFileSync(outPath, JSON.stringify({ no }, null, 2) + "\n", "utf8");
const missing = Object.entries(no).filter(([k, v]) => v === source[k]).length;
console.log(`Wrote ${Object.keys(no).length} keys to ${outPath}`);
console.log(`Still English: ${missing}`);
