export interface Member {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  dob?: string;
  branch: string;
  region?: string;
  guardianName?: string;
  status: 'active' | 'pending' | 'suspended' | 'expelled';
  joinedDate: string;
  subscriptionExpiry: string;
  institutionId?: string;
  institutionName?: string;
  source?: 'admin' | 'institution' | 'self';
  memberType?: 'youth' | 'adult';
  membershipNo?: string;
  interests?: string;
  guardianPhone?: string;
  idNo?: string;
  maritalStatus?: string;
  poBox?: string;
  town?: string;
  occupation?: string;
  employer?: string;
  workPhone?: string;
  workEmail?: string;
  otherSkills?: string;
  nextOfKinName?: string;
  nextOfKinRelationship?: string;
  nextOfKinPhone?: string;
  nextOfKinEmail?: string;
  yearJoinedGuiding?: string;
  levelsUndertaken?: string;
  trainingsReceived?: string;
  guidingAwards?: string;
  leadershipHistory?: string;
  currentInvolvement?: string;
  currentLevelOfEngagement?: string;
  currentSupport?: string;
}

export interface Transaction {
  id: string;
  memberId: string;
  memberName: string;
  type: 'invoice' | 'receipt';
  amount: number;
  description: string;
  date: string;
  status: 'pending' | 'paid';
  linkedInvoiceId?: string;
}

export interface EventItem {
  id: string;
  title: string;
  date: string;
  location?: string;
  description?: string;
}

export interface Participation {
  id: string;
  eventId: string;
  memberId: string;
  memberName: string;
  eventTitle: string;
  date: string;
}

export interface Communication {
  id: string;
  type: 'reminder' | 'bulk';
  subject: string;
  body: string;
  audience: string;
  recipientCount: number;
  date: string;
}

export interface AdminAccount {
  id: string;
  userId?: string;
  email: string;
  name?: string;
  status: 'invited' | 'active';
  isSuperAdmin: boolean;
  canEdit: boolean;
  canManageAdmins: boolean;
}

export interface Institution {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  county?: string;
  subCounty?: string;
  principalName?: string;
  principalMobile?: string;
  principalEmail?: string;
  noOfUnits?: string;
  noOfGuidesInUnit?: string;
  guideLeaderName?: string;
  guideLeaderPhone?: string;
  guideLeaderEmail?: string;
  meetingDayTime?: string;
}

export interface Category {
  id: string;
  name: string;
}
