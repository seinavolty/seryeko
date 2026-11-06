import React from 'react'
import LegalPage, { LegalContact, LegalList, LegalSection } from '../../components/LegalPage'
import { LEGAL_DETAILS } from '../../config/legal'

const SECTIONS = [
  { id: 'overview', title: 'Overview' },
  { id: 'important-notice', title: 'Important notice' },
  { id: 'notice', title: 'Copyright notice' },
  { id: 'response', title: 'What happens next' },
  { id: 'counter', title: 'Counter-notice' },
  { id: 'repeat', title: 'Repeat infringement' },
  { id: 'misrepresentation', title: 'False statements' },
  { id: 'contact', title: 'Designated contact' },
]

export default function Dmca() {
  return (
    <LegalPage
      title="DMCA & Copyright Policy"
      description="SeryeKo respects intellectual property rights and provides a process for copyright owners to report allegedly infringing material."
      sections={SECTIONS}
    >
      <LegalSection id="overview" title="1. Overview">
        <p>
          {LEGAL_DETAILS.serviceName} respects the intellectual property rights of others and expects its users to
          do the same. We comply with the Digital Millennium Copyright Act (DMCA) and respond promptly to valid
          copyright infringement notices. {LEGAL_DETAILS.serviceName} has been operating since 2026.
        </p>
        <p>
          Although the service operates from the Philippines, we voluntarily respond to notices that substantially
          comply with the U.S. Digital Millennium Copyright Act (17 U.S.C. § 512) and to valid requests under
          applicable Philippine copyright law.
        </p>
        <p>
          This process is only for copyright complaints. For other legal or support issues, contact general support.
        </p>
      </LegalSection>

      <LegalSection id="important-notice" title="2. Important notice">
        <p>
          {LEGAL_DETAILS.serviceName} is a drama streaming aggregation service. We do not host, upload, store, or
          distribute any video content, media files, or copyrighted materials on our servers. All content accessible
          through the service is sourced from and hosted by 40+ third-party platforms including StarShort, DramaBox,
          ReelShort, ShortMax, FlickReels, IQIYI, Bstation, and others.
        </p>
        <p>
          If you believe that content accessible through the service infringes upon your copyright, please follow
          the procedures outlined below.
        </p>
      </LegalSection>

      <LegalSection id="notice" title="3. Sending a copyright notice">
        <p>A copyright owner or authorized agent should send a written notice containing all of the following:</p>
        <LegalList>
          <li>A physical or electronic signature of the copyright owner or authorized agent.</li>
          <li>Identification of each copyrighted work claimed to be infringed, or a representative list when one notice covers multiple works.</li>
          <li>Identification and exact location of the allegedly infringing material, including specific SeryeKo URLs and enough detail for us to find it.</li>
          <li>Your full name, organization if applicable, postal address, telephone number, and email address.</li>
          <li>A good-faith statement that the complained-of use is not authorized by the owner, its agent, or law.</li>
          <li>A statement, under penalty of perjury, that the notice is accurate and you are the owner or authorized to act for the owner.</li>
        </LegalList>
        <p>Send the complete notice to the designated contact below. Incomplete notices may delay our response.</p>
      </LegalSection>

      <LegalSection id="response" title="4. What happens next">
        <p>
          We may forward the notice to the affected provider or account holder, remove or restrict the material,
          request more information, or reject a notice that is invalid or abusive. Removal does not determine who
          owns the work or whether an infringement occurred.
        </p>
      </LegalSection>

      <LegalSection id="counter" title="5. Sending a counter-notice">
        <p>
          If your material was removed or disabled because of a mistake or misidentification, you may send a
          counter-notice containing:
        </p>
        <LegalList>
          <li>Your physical or electronic signature.</li>
          <li>Identification of the removed material and where it appeared before removal.</li>
          <li>A statement under penalty of perjury that you have a good-faith belief the material was removed because of mistake or misidentification.</li>
          <li>Your name, postal address, telephone number, and email address.</li>
          <li>Your consent to the jurisdiction of the appropriate U.S. federal district court, or another statement of jurisdiction required by applicable law, and acceptance of service from the original complainant.</li>
        </LegalList>
        <p>
          Where the DMCA applies, we may restore material after 10–14 business days unless the original complainant
          tells us that court action has been filed. Other legal regimes may require a different process.
        </p>
      </LegalSection>

      <LegalSection id="repeat" title="6. Repeat infringement">
        <p>
          In appropriate circumstances, we may suspend or terminate accounts of repeat infringers and take
          reasonable steps to prevent continued infringement, considering the facts and applicable law.
        </p>
      </LegalSection>

      <LegalSection id="misrepresentation" title="7. False statements">
        <p>
          Knowingly making material misrepresentations in a notice or counter-notice may create liability for
          damages, costs, and legal fees. Consider fair use, licenses, public-domain status, and other lawful uses
          before submitting a complaint. You may wish to obtain legal advice.
        </p>
      </LegalSection>

      <LegalSection id="contact" title="8. Designated copyright contact">
        <p>Send notices and counter-notices to:</p>
        <LegalContact subject="Copyright notice" dmca />
      </LegalSection>
    </LegalPage>
  )
}
