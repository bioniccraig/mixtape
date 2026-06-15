// Legal.jsx — Privacy Policy and Terms of Service
// Linked from the app footer and required for YouTube API quota increase + Apple MusicKit.

export default function Legal() {
  const appName   = 'MixTape / Say It With Music';
  const domain    = 'sayitwithmusic.net';
  const contact   = 'bionic.craig@googlemail.com';
  const effective = 'June 2026';

  return (
    <div className="legal-page">
      <header className="legal-header">
        <a href="/" className="legal-home">◼ MixTape</a>
      </header>

      <main className="legal-body">

        {/* ── Privacy Policy ─────────────────────────────────────────────── */}
        <section id="privacy">
          <h1>Privacy Policy</h1>
          <p className="legal-meta">Effective: {effective}</p>

          <p>
            {appName} ("<strong>we</strong>", "<strong>us</strong>", "<strong>our</strong>")
            is a web application that lets you create and share personalised music playlists
            (&ldquo;mixtapes&rdquo;) with friends. This Privacy Policy explains what information
            we collect, how we use it, and your rights.
          </p>

          <h2>1. Information We Collect</h2>
          <p><strong>Account information.</strong> If you create an account, we store your email address and a
          hashed password via <a href="https://supabase.com" target="_blank" rel="noopener noreferrer">Supabase Auth</a>.</p>
          <p><strong>Tape content.</strong> The tape names, track lists, and personal notes you enter are stored
          in our database so you can share and revisit them.</p>
          <p><strong>Usage events.</strong> When a shared tape is opened we log an anonymous event
          (tape ID, timestamp, and — if you are signed in — your user ID). We use this only to
          show creators that their tape was received.</p>
          <p><strong>No payment data.</strong> We do not collect or store credit card or payment information.</p>

          <h2>2. Third-Party Services</h2>
          <p>The app integrates with the following third-party platforms. Your use of those
          platforms is governed by their own privacy policies:</p>
          <ul>
            <li><a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google / YouTube</a> — used to find and play music videos.</li>
            <li><a href="https://www.apple.com/legal/privacy/" target="_blank" rel="noopener noreferrer">Apple Music / MusicKit</a> — used to play music for Apple Music subscribers. Apple Music authorisation is handled entirely by Apple; we never see your Apple ID credentials.</li>
            <li><a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer">Supabase</a> — hosts our database and authentication. Data is stored in the EU (Ireland).</li>
          </ul>

          <h2>3. How We Use Your Information</h2>
          <ul>
            <li>To let you create, save, and share mixtapes.</li>
            <li>To show you tapes you have received.</li>
            <li>To improve the service.</li>
          </ul>
          <p>We do <strong>not</strong> sell, rent, or trade your personal information to any third party.</p>

          <h2>4. Cookies and Local Storage</h2>
          <p>We use browser <code>localStorage</code> and <code>sessionStorage</code> to save your
          current tape between sessions and to assign an anonymous analytics session ID. No
          advertising or tracking cookies are set.</p>

          <h2>5. Data Retention</h2>
          <p>Account data is kept for as long as your account is active. You may request deletion
          at any time by emailing us at <a href={`mailto:${contact}`}>{contact}</a>. Deleted accounts
          and their tapes are removed within 30 days.</p>

          <h2>6. Children&rsquo;s Privacy</h2>
          <p>The service is not directed at children under 13. We do not knowingly collect
          personal information from children under 13.</p>

          <h2>7. Changes to This Policy</h2>
          <p>We may update this policy from time to time. Continued use of the service after
          changes are posted constitutes acceptance of the updated policy.</p>

          <h2>8. Contact</h2>
          <p>Questions about privacy? Email us at <a href={`mailto:${contact}`}>{contact}</a>.</p>
        </section>

        <hr className="legal-divider" />

        {/* ── Terms of Service ───────────────────────────────────────────── */}
        <section id="terms">
          <h1>Terms of Service</h1>
          <p className="legal-meta">Effective: {effective}</p>

          <p>
            By accessing or using {appName} ("{domain}"), you agree to these Terms of Service.
            Please read them carefully.
          </p>

          <h2>1. The Service</h2>
          <p>
            {appName} is a tool that lets you curate playlists of songs (&ldquo;mixtapes&rdquo;)
            and share them via a unique link. Playback is provided through YouTube and Apple Music;
            you must have valid accounts or subscriptions with those services where required.
          </p>

          <h2>2. Your Account</h2>
          <p>You are responsible for maintaining the confidentiality of your account credentials.
          You must not share your account or allow others to access it on your behalf.</p>

          <h2>3. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use the service for any unlawful purpose.</li>
            <li>Upload or share content that infringes third-party intellectual property rights.</li>
            <li>Attempt to circumvent any technical measures we use to protect the service.</li>
            <li>Use automated tools to scrape or abuse the service.</li>
          </ul>

          <h2>4. Your Content</h2>
          <p>You retain ownership of any personal notes or tape names you create. By saving
          content to the service you grant us a limited licence to store and transmit it solely
          for the purpose of operating the service.</p>
          <p>Music tracks are sourced from YouTube and Apple Music. We do not host, store, or
          distribute any audio or video content.</p>

          <h2>5. Intellectual Property</h2>
          <p>The {appName} name, logo, and application code are our intellectual property.
          You may not reproduce or distribute them without permission.</p>

          <h2>6. Disclaimer of Warranties</h2>
          <p>The service is provided <strong>"as is"</strong> without warranties of any kind, express
          or implied. We do not guarantee uninterrupted or error-free operation, nor that any
          particular track will be available for playback via YouTube or Apple Music.</p>

          <h2>7. Limitation of Liability</h2>
          <p>To the maximum extent permitted by law, we are not liable for any indirect,
          incidental, or consequential damages arising from your use of the service.</p>

          <h2>8. Termination</h2>
          <p>We reserve the right to suspend or terminate accounts that violate these terms,
          with or without notice.</p>

          <h2>9. Governing Law</h2>
          <p>These terms are governed by the laws of England and Wales. Any disputes will be
          subject to the exclusive jurisdiction of the courts of England and Wales.</p>

          <h2>10. Changes to These Terms</h2>
          <p>We may update these terms from time to time. Continued use of the service after
          changes are posted constitutes acceptance of the updated terms.</p>

          <h2>11. Contact</h2>
          <p>Questions? Email us at <a href={`mailto:${contact}`}>{contact}</a>.</p>
        </section>

      </main>

      <footer className="legal-footer">
        <a href="/">← Back to MixTape</a>
      </footer>
    </div>
  );
}
