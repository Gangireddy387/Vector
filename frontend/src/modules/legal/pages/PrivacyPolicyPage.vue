<script setup lang="ts">
import { LEGAL } from '@/constants/legal'
import LegalDocument, { type LegalSection } from '../components/LegalDocument.vue'

const SECTIONS: LegalSection[] = [
  { id: 'who-we-are', title: 'Who we are' },
  { id: 'information', title: 'Information we collect' },
  { id: 'use', title: 'How we use information' },
  { id: 'legal-bases', title: 'Legal bases' },
  { id: 'ai', title: 'AI features' },
  { id: 'sharing', title: 'Sharing and processors' },
  { id: 'storage', title: 'Cookies and local storage' },
  { id: 'retention', title: 'Data retention' },
  { id: 'security', title: 'Security' },
  { id: 'rights', title: 'Your rights' },
  { id: 'transfers', title: 'International transfers' },
  { id: 'children', title: 'Children' },
  { id: 'changes', title: 'Changes to this policy' },
  { id: 'contact', title: 'Contact us' },
]
</script>

<template>
  <LegalDocument
    title="Privacy Policy"
    :summary="`This policy explains what personal information ${LEGAL.productName} collects when you use it, why, who it is shared with and the choices you have. We collect only what we need to run the service, we never sell your data and we do not use advertising trackers.`"
    :sections="SECTIONS"
  >
    <h2 id="who-we-are">Who we are</h2>
    <p>
      {{ LEGAL.productName }} is a work-management application operated by <strong>{{ LEGAL.companyName }}</strong>
      <template v-if="LEGAL.postalAddress"> ({{ LEGAL.postalAddress }})</template> (“we”, “us”). For personal information in workspaces that we host, we act as the
      <strong>controller</strong> for account data and as a <strong>processor</strong> for the content your organisation stores in its workspace, which your
      organisation controls.
    </p>

    <h2 id="information">Information we collect</h2>
    <h3>Information you provide</h3>
    <ul>
      <li><strong>Account details</strong> — name, email address and password. Passwords are stored only as a salted bcrypt hash; we never see them in plain text.</li>
      <li><strong>Profile details</strong> — optional job title, time zone and avatar colour.</li>
      <li>
        <strong>Workspace content</strong> — projects, issues, descriptions, comments, mentions, labels, sprints, time logs, automation rules, recurring tasks
        and files you attach.
      </li>
      <li><strong>Invitations</strong> — email addresses of colleagues you invite.</li>
      <li><strong>Support messages</strong> — anything you send when you contact us.</li>
    </ul>
    <h3>Information collected automatically</h3>
    <ul>
      <li><strong>Activity history</strong> — who changed what and when inside a workspace, shown in issue history and activity feeds.</li>
      <li><strong>Technical data</strong> — IP address, browser and device type, and request times in server logs, used for security and troubleshooting.</li>
      <li><strong>Last active time</strong> — so admins can see account status.</li>
    </ul>

    <h2 id="use">How we use information</h2>
    <ul>
      <li>To create and secure your account and sign you in.</li>
      <li>To provide the service: store your work, show it to people in your workspace, send notifications and run the automations you configure.</li>
      <li>To send service emails — invitations, password resets, assignment and mention notifications, due-date reminders and the optional daily digest.</li>
      <li>To keep the service safe — detect abuse, investigate incidents and enforce our Terms.</li>
      <li>To fix bugs and improve reliability.</li>
    </ul>
    <p>We do not sell personal information and we do not use it for advertising.</p>

    <h2 id="legal-bases">Legal bases</h2>
    <p>Where data-protection laws such as the GDPR or UK GDPR apply, we rely on:</p>
    <ul>
      <li><strong>Contract</strong> — to provide the service you or your organisation signed up for.</li>
      <li><strong>Legitimate interests</strong> — to secure and improve the service, in ways that do not override your rights.</li>
      <li><strong>Consent</strong> — for optional emails such as the daily digest, which you can switch off at any time in Settings.</li>
      <li><strong>Legal obligation</strong> — where we must keep or disclose information by law.</li>
    </ul>

    <h2 id="ai">AI features</h2>
    <p>
      If your workspace has AI features enabled, the text you choose to process — for example an issue title and description when you use
      <em>Draft with AI</em>, or an issue’s description and comments when you use <em>Summarize</em> or <em>Break it down</em> — is sent to our AI provider
      (OpenAI) to generate the result. Under the provider’s API terms this data is not used to train its models. When AI is not configured, these features run
      entirely on our servers using built-in rules and nothing is sent to a third party.
    </p>

    <h2 id="sharing">Sharing and processors</h2>
    <p>We share personal information only as needed to run the service:</p>
    <ul>
      <li><strong>People in your workspace</strong> — members can see each other’s names, emails and the work they are part of, according to their project roles.</li>
      <li><strong>Hosting and database providers</strong> — to store and serve the application and its data.</li>
      <li><strong>Email delivery (SendGrid)</strong> — recipient addresses and message content for service emails.</li>
      <li><strong>AI provider (OpenAI)</strong> — only when AI features are enabled, as described above.</li>
      <li><strong>Legal and safety</strong> — when required by law or to protect rights, property or safety.</li>
      <li><strong>Business transfers</strong> — if the service is merged or sold, subject to this policy.</li>
    </ul>
    <p>Each processor is bound by contract to protect the data and use it only to provide its service to us.</p>

    <h2 id="storage">Cookies and local storage</h2>
    <p>
      We do not use advertising or analytics cookies. The app stores a small amount of data in your browser’s local storage so it works properly: your sign-in
      token, your light or dark mode choice and interface preferences such as the last project you used and whether the sidebar is collapsed. When you install
      the app, a service worker caches the application files so it loads quickly and can open offline. Signing out removes your sign-in token.
    </p>

    <h2 id="retention">Data retention</h2>
    <ul>
      <li>Account and workspace data is kept while the account or workspace is active.</li>
      <li>When an admin deletes content or a project, it is removed from the live database straight away.</li>
      <li>Server logs are kept for a limited period for security purposes and then deleted.</li>
      <li>Backups, where used, are overwritten on a rolling basis.</li>
      <li>We may keep limited information longer when the law requires it.</li>
    </ul>

    <h2 id="security">Security</h2>
    <p>
      We protect data with encryption in transit (HTTPS), hashed passwords, signed and expiring session tokens, role-based access to projects and workspace
      administration, and security headers on every response. No system is perfectly secure; if we learn of a breach affecting your data we will notify you as the
      law requires.
    </p>

    <h2 id="rights">Your rights</h2>
    <p>Depending on where you live, you may have the right to:</p>
    <ul>
      <li>access the personal information we hold about you and receive a copy of it;</li>
      <li>correct inaccurate information — most profile details can be edited in Settings;</li>
      <li>delete your information or ask us to restrict its use;</li>
      <li>object to processing based on legitimate interests;</li>
      <li>withdraw consent for optional emails at any time;</li>
      <li>complain to your local data-protection authority.</li>
    </ul>
    <p>
      To exercise these rights, email <a :href="`mailto:${LEGAL.contactEmail}`">{{ LEGAL.contactEmail }}</a>. If your account belongs to an organisation’s
      workspace, we may refer your request to that organisation, as it controls the workspace content.
    </p>

    <h2 id="transfers">International transfers</h2>
    <p>
      Our providers may process data in countries other than yours. Where required, we use recognised safeguards such as the European Commission’s Standard
      Contractual Clauses.
    </p>

    <h2 id="children">Children</h2>
    <p>{{ LEGAL.productName }} is a business tool and is not intended for children under 16. We do not knowingly collect their personal information.</p>

    <h2 id="changes">Changes to this policy</h2>
    <p>
      We may update this policy as the service evolves. We will change the effective date above and, for significant changes, notify workspace admins by email or
      in the app before they take effect.
    </p>

    <h2 id="contact">Contact us</h2>
    <p>
      Questions or requests about privacy: <a :href="`mailto:${LEGAL.contactEmail}`">{{ LEGAL.contactEmail }}</a>
      <template v-if="LEGAL.postalAddress"> · {{ LEGAL.companyName }}, {{ LEGAL.postalAddress }}</template>.
    </p>
  </LegalDocument>
</template>
