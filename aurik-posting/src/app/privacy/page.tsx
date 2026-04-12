export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "4rem 1rem 6rem", fontFamily: "Georgia, serif", color: "#1a1a18", lineHeight: 1.75 }}>
      <p style={{ fontFamily: "monospace", fontSize: 13, letterSpacing: "0.15em", textTransform: "uppercase", color: "#888", marginBottom: "3rem" }}>Aurik</p>
      <h1 style={{ fontSize: "2rem", fontWeight: "normal", marginBottom: "0.5rem" }}>Politique de confidentialité</h1>
      <p style={{ fontFamily: "monospace", fontSize: 13, color: "#999", marginBottom: "3rem" }}>En vigueur depuis le 8 avril 2025</p>
      <hr style={{ border: "none", borderTop: "1px solid #e5e3de", margin: "2.5rem 0" }} />
      <h2 style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#888", marginBottom: "1rem" }}>1. Présentation</h2>
      <p>Aurik (<a href="https://aurikcore.ai">aurikcore.ai</a>) est un outil de gestion et de publication automatique de contenu sur Instagram. La présente politique décrit les données que nous collectons, leur utilisation et leur protection.</p>
      <h2 style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#888", margin: "2.5rem 0 1rem" }}>2. Données collectées</h2>
      <p>Dans le cadre du fonctionnement de nos services, nous collectons et traitons :</p>
      <ul style={{ paddingLeft: "1.25rem", marginBottom: "1rem" }}>
        <li>Les tokens d'accès Instagram nécessaires à la publication via l'API Meta.</li>
        <li>Les identifiants de compte Instagram associés à l'application.</li>
        <li>Les contenus à publier (textes, images, vidéos) transmis pour planification et diffusion.</li>
        <li>Les données de configuration techniques (paramètres, identifiants Meta).</li>
      </ul>
      <h2 style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#888", margin: "2.5rem 0 1rem" }}>3. Utilisation des données</h2>
      <p>Les données collectées sont utilisées exclusivement pour publier automatiquement du contenu sur le compte Instagram associé, gérer la planification des publications, et assurer le bon fonctionnement technique de l'application.</p>
      <p>Aucune donnée n'est vendue, cédée ou partagée avec des tiers à des fins commerciales ou publicitaires.</p>
      <h2 style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#888", margin: "2.5rem 0 1rem" }}>4. Partage des données</h2>
      <p>Nous utilisons l'API Meta (Facebook / Instagram) pour la publication de contenu, soumise aux <a href="https://developers.facebook.com/terms/">Conditions d'utilisation de la plateforme Meta</a>. Nous utilisons Vercel comme infrastructure d'hébergement sécurisé.</p>
      <h2 style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#888", margin: "2.5rem 0 1rem" }}>5. Sécurité</h2>
      <p>Les données sensibles (tokens, identifiants) sont stockées sous forme de variables d'environnement chiffrées sur Vercel. Aucune donnée sensible n'est exposée publiquement dans le code source.</p>
      <h2 style={{ fontFamily: "monospace", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#888", margin: "2.5rem 0 1rem" }}>6. Contact</h2>
      <p>Pour toute question : <a href="mailto:contact@aurikcore.ai">contact@aurikcore.ai</a></p>
      <hr style={{ border: "none", borderTop: "1px solid #e5e3de", margin: "2.5rem 0" }} />
      <p style={{ fontFamily: "monospace", fontSize: 13, color: "#aaa" }}>Cette politique peut être mise à jour. Toute modification sera reflétée sur cette page.</p>
    </main>
  );
}
