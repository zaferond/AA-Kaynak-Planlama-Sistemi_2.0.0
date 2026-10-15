import { checkTabTransitions } from "./browser-checks/tab-transitions.mjs";
import { checkHeadcountReports } from "./browser-checks/headcount-reports.mjs";
import { checkTodayLineVisibility } from "./browser-checks/today-line-visibility.mjs";
import { checkHorizontalScroll } from "./browser-checks/horizontal-scroll.mjs";
import { checkTeamPlanningPermissions } from "./browser-checks/team-planning-permissions.mjs";
import { checkAdAdminRole } from "./browser-checks/ad-admin-role.mjs";
import { checkActivePostingPlanning } from "./browser-checks/active-posting-planning.mjs";
import { checkFilterAppliedToast } from "./browser-checks/filter-applied-toast.mjs";
import { checkActualManagerHierarchy } from "./browser-checks/actual-manager-hierarchy.mjs";
import { checkActualRemainingHours } from "./browser-checks/actual-remaining-hours.mjs";
import { checkTeamCapacityHeader } from "./browser-checks/team-capacity-header.mjs";
import { checkAllocationFocusLayers } from "./browser-checks/allocation-focus-layers.mjs";
import { checkTeamOnlyResource } from "./browser-checks/team-only-resource.mjs";
import { checkProjectCodes } from "./browser-checks/project-codes.mjs";
import { checkRemainingReportTotals } from "./browser-checks/remaining-report-totals.mjs";
import { checkPlannedTeamFreeze } from "./browser-checks/planned-team-freeze.mjs";
import { checkPlanningPermissions } from "./browser-checks/planning-permissions.mjs";
import { checkActualTeamView } from "./browser-checks/actual-team-view.mjs";
import { checkReportOwnerSource } from "./browser-checks/report-owner-source.mjs";
import assert from "node:assert/strict";
import { fixture } from "./browser-checks/fixture.mjs";
import { checkRisks } from "./browser-checks/risk.mjs";
import { checkCalendar } from "./browser-checks/calendar.mjs";
import { checkCalendarDrafts } from "./browser-checks/calendar-drafts.mjs";
import { checkActualAllocation } from "./browser-checks/actual-allocation.mjs";
import { checkPlannedAllocation } from "./browser-checks/planned-allocation.mjs";
import { checkWorkspaceFilters } from "./browser-checks/workspace-filters.mjs";
import { checkWorkspaceActions } from "./browser-checks/workspace-actions.mjs";
import { checkAccess } from "./browser-checks/access.mjs";
import { checkImportRestore } from "./browser-checks/import-restore.mjs";
import { checkProjectTables } from "./browser-checks/project-tables.mjs";
import { checkRiskConcurrency } from "./browser-checks/risk-concurrency.mjs";
import { checkTimelineLayers } from "./browser-checks/timeline-layers.mjs";
import { checkMilestoneOverlap } from "./browser-checks/milestone-overlap.mjs";
import { checkSessionConsistency } from "./browser-checks/session-consistency.mjs";
import { checkEntityEditors } from "./browser-checks/entity-editors.mjs";
import { checkTableStyles } from "./browser-checks/table-styles.mjs";
import { checkLeadershipFilterRoots } from "./browser-checks/leadership-filter-roots.mjs";
import { checkPlannedHierarchy } from "./browser-checks/planned-hierarchy.mjs";
import { checkPermissionPopup } from "./browser-checks/permission-popup.mjs";
import { checkEmployeeAccess } from "./browser-checks/employee-access.mjs";
import { checkMemberBadges } from "./browser-checks/member-badges.mjs";
import { checkResourceRoles } from "./browser-checks/resource-roles.mjs";
import { checkDirectoryManagement } from "./browser-checks/directory-management.mjs";
import { checkMilestoneReportMenu } from "./browser-checks/milestone-report-menu.mjs";
import { checkTimelineConcurrency } from "./browser-checks/timeline-concurrency.mjs";
import { checkHeadcountForecast } from "./browser-checks/headcount-forecast.mjs";
import { checkRiskSaveConfirmation } from "./browser-checks/risk-save-confirmation.mjs";
import { checkExcelXmlCharacters } from "./browser-checks/excel-xml-characters.mjs";
import { checkRiskSystems } from "./browser-checks/risk-systems.mjs";
import { checkActivityReport } from "./browser-checks/activity-report.mjs";
import { checkResourceReports } from "./browser-checks/resource-reports.mjs";
import { checkViewportScroll } from "./browser-checks/viewport-scroll.mjs";
import { checkTransportRecovery } from "./browser-checks/transport-recovery.mjs";
import { checkMilestoneParentDates } from "./browser-checks/milestone-parent-dates.mjs";
import { checkWorkspaceNavigation } from "./browser-checks/workspace-navigation.mjs";
import { checkPortalRefresh } from "./browser-checks/portal-refresh.mjs";

import { checkMutationAdmission } from "./browser-checks/mutation-admission.mjs";

for (const check of [
  checkHeadcountReports,
  checkTodayLineVisibility,
  checkTabTransitions,
  checkHorizontalScroll,
  checkTeamPlanningPermissions,
  checkActivePostingPlanning,
  checkFilterAppliedToast,
  checkAdAdminRole,
  checkActualManagerHierarchy,
  checkActualRemainingHours,
  checkTeamCapacityHeader,
  checkAllocationFocusLayers,
  checkTeamOnlyResource,
  checkProjectCodes,
  checkRemainingReportTotals,
  checkPlannedTeamFreeze,
  checkPlanningPermissions,
  checkActualTeamView,
  checkReportOwnerSource,
]) {
  const isolated = await fixture();
  try {
    await check(isolated);
    assert.deepEqual(isolated.errors, []);
    await isolated.report("passed");
  } catch (error) {
    await isolated.report("failed", error);
    throw error;
  } finally {
    await isolated.close();
  }
}

const hierarchy = await fixture();
try {
  await checkPlannedHierarchy(hierarchy);
  assert.deepEqual(hierarchy.errors, []);
  await hierarchy.report("passed");
} finally {
  await hierarchy.close();
}

const roots = await fixture();
try {
  await checkLeadershipFilterRoots(roots);
  assert.deepEqual(roots.errors, []);
  await roots.report("passed");
} finally {
  await roots.close();
}

const combined = await fixture();
try {
  await checkEmployeeAccess(combined);
  await checkPermissionPopup(combined);
  assert.deepEqual(combined.errors, []);
  await combined.report("passed");
} finally {
  await combined.close();
}

const f = await fixture();
try {
  await checkMutationAdmission(f);
  await checkTransportRecovery(f);
  await checkMilestoneParentDates(f);
  await checkTableStyles(f);
  await checkSessionConsistency(f);
  await checkWorkspaceNavigation(f);
  await checkPortalRefresh(f);
  await checkEntityEditors(f);
  await checkDirectoryManagement(f);
  await checkResourceRoles(f);
  await checkRiskSystems(f);
  await checkHeadcountForecast(f);
  await checkMilestoneReportMenu(f);
  await checkTimelineConcurrency(f);
  await checkRiskSaveConfirmation(f);
  await checkExcelXmlCharacters(f);
  await checkRisks(f);
  await checkRiskConcurrency(f);
  await checkWorkspaceFilters(f);
  await checkWorkspaceActions(f);
  await checkPlannedAllocation(f);
  await checkActualAllocation(f);
  await checkCalendarDrafts(f);
  await checkCalendar(f);
  await checkImportRestore(f);
  await checkAccess(f);
  await checkProjectTables(f);
  await checkMilestoneOverlap(f);
  await checkTimelineLayers(f);
  await checkResourceReports(f);
  await checkMemberBadges(f);
  // Activity's fixed capacity expectations require its own empty calendar;
  // the preceding calendar checks intentionally retain shared holidays.
  const activity = await fixture();
  try {
    await checkActivityReport(activity);
  } finally {
    f.checks.push(...activity.checks);
    f.errors.push(...activity.errors);
    await activity.close();
  }
  await checkViewportScroll(f);
  assert.deepEqual(f.errors, []);
  await f.report("passed");
  console.log(
    JSON.stringify({
      status: "passed",
      checks: f.checks.length,
      artifacts: f.dir,
    }),
  );
} catch (error) {
  await f.report("failed", error);
  console.error("Browser checks failed; artifacts:", f.dir);
  throw error;
} finally {
  await f.close();
}
