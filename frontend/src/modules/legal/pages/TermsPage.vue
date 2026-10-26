<script setup lang="ts">
import { LEGAL } from '@/constants/legal'
import LegalDocument, { type LegalSection } from '../components/LegalDocument.vue'

const SECTIONS: LegalSection[] = [
  { id: 'acceptance', title: 'Accepting these terms' },
  { id: 'accounts', title: 'Accounts and workspaces' },
  { id: 'acceptable-use', title: 'Acceptable use' },
  { id: 'content', title: 'Your content' },
  { id: 'ai', title: 'AI features' },
  { id: 'service', title: 'The service' },
  { id: 'termination', title: 'Suspension and termination' },
  { id: 'disclaimers', title: 'Disclaimers' },
  { id: 'liability', title: 'Limitation of liability' },
  { id: 'law', title: 'Governing law' },
  { id: 'changes', title: 'Changes to these terms' },
  { id: 'contact', title: 'Contact' },
]
</script>

<template>
  <LegalDocument
    title="Terms of Service"
    :summary="`These terms govern your use of ${LEGAL.productName}. In short: use it lawfully, keep your account secure, you own your content, and we work hard to keep the service running but cannot promise it will never fail.`"
    :sections="SECTIONS"
  >
    <h2 id="acceptance">Accepting these terms</h2>
    <p>
      By creating an account, accepting an invitation or using {{ LEGAL.productName }} you agree to these Terms and to our
      <RouterLink :to="{ name: 'privacy' }">Privacy Policy</RouterLink>. If you use the service on behalf of an organisation, you confirm you are authorised to
      accept these terms for it, and “you” includes that organisation.
    </p>

    <h2 id="accounts">Accounts and workspaces</h2>
    <ul>
      <li>Provide accurate information and keep your password confidential. You are responsible for activity under your account.</li>
      <li>Tell us promptly at <a :href="`mailto:${LEGAL.contactEmail}`">{{ LEGAL.contactEmail }}</a> if you suspect unauthorised access.</li>
      <li>
        Workspace admins control who can join, members’ roles and workspace settings, and may deactivate accounts. Project admins control their projects’ members,
        workflow and automations.
      </li>
    </ul>

    <h2 id="acceptable-use">Acceptable use</h2>
    <p>You must not:</p>
    <ul>
      <li>break the law or infringe anyone’s rights, including privacy and intellectual-property rights;</li>
      <li>upload malware or content that is unlawful, harassing, hateful or deceptive;</li>
      <li>try to access accounts, workspaces or data you are not permitted to access;</li>
      <li>probe, overload or disrupt the service, or bypass its security or rate limits;</li>
      <li>use automations or invitations to send spam;</li>
      <li>resell or copy the service, or reverse-engineer it except where the law allows.</li>
    </ul>

    <h2 id="content">Your content</h2>
    <p>
      You and your organisation keep ownership of everything you put into {{ LEGAL.productName }} — tasks, comments, files and other content. You give us a
      limited licence to host, copy, process and display that content only as needed to provide and secure the service. You are responsible for having the right
      to upload it.
    </p>

    <h2 id="ai">AI features</h2>
    <p>
      AI-generated drafts, summaries and suggestions can be inaccurate or incomplete. Review them before relying on them. You own the output generated for your
      workspace, subject to the rights of others. How AI requests are processed is described in the
      <RouterLink :to="{ name: 'privacy', hash: '#ai' }">Privacy Policy</RouterLink>.
    </p>

    <h2 id="service">The service</h2>
    <p>
      We continuously improve {{ LEGAL.productName }} and may add, change or remove features. We aim for high availability but the service may occasionally be
      unavailable for maintenance or for reasons outside our control. Keep your own copies of anything critical.
    </p>

    <h2 id="termination">Suspension and termination</h2>
    <p>
      You can stop using the service at any time, and a workspace admin can deactivate members. We may suspend or close accounts that breach these terms or put
      the service or other users at risk; where reasonable we will warn you first. Sections that by their nature should survive termination — ownership,
      disclaimers, limitation of liability and governing law — continue to apply.
    </p>

    <h2 id="disclaimers">Disclaimers</h2>
    <p>
      To the extent the law allows, the service is provided “as is” and “as available”, without warranties of any kind, including fitness for a particular
      purpose and non-infringement.
    </p>

    <h2 id="liability">Limitation of liability</h2>
    <p>
      To the extent the law allows, {{ LEGAL.companyName }} is not liable for indirect, incidental, special or consequential losses, or for lost profits,
      revenue or data. Our total liability for any claim relating to the service is limited to the greater of the amount you paid us for the service in the
      twelve months before the claim, and one hundred US dollars. Nothing in these terms limits liability that cannot be limited by law.
    </p>

    <h2 id="law">Governing law</h2>
    <p>
      These terms are governed by the laws of {{ LEGAL.jurisdiction }}, and its courts have jurisdiction over any dispute, unless the law where you live gives
      you the right to bring proceedings there.
    </p>

    <h2 id="changes">Changes to these terms</h2>
    <p>
      We may update these terms. We will change the effective date above and give workspace admins reasonable notice of material changes. Continuing to use the
      service after changes take effect means you accept them.
    </p>

    <h2 id="contact">Contact</h2>
    <p>
      Questions about these terms: <a :href="`mailto:${LEGAL.contactEmail}`">{{ LEGAL.contactEmail }}</a>
      <template v-if="LEGAL.postalAddress"> · {{ LEGAL.companyName }}, {{ LEGAL.postalAddress }}</template>.
    </p>
  </LegalDocument>
</template>
