/** Run before immutable migration 0006 on databases created by earlier releases. */
export async function prepareLegacyReports(
  db: D1Database,
  now = Date.now(),
  newId = () => crypto.randomUUID(),
) {
  const schema = await db
    .prepare(
      `SELECT name FROM sqlite_master
    WHERE (type='table' AND name='reports') OR (type='index' AND name='ux_reports_active_reporter_reason')`,
    )
    .all<{ name: string }>();
  if (
    !schema.results.some((r) => r.name === "reports") ||
    schema.results.some((r) => r.name === "ux_reports_active_reporter_reason")
  )
    return { groups: 0, archived: 0 };

  let groups = 0,
    archived = 0;
  const activeGroup =
    "reporter_user_id=? AND target_type=? AND target_id=? AND reason_code=? AND status IN ('open','reviewing')";
  // Each group is one atomic, audited operation. Pages bound the working set;
  // rerunning after interruption resumes from the remaining duplicate groups.
  for (;;) {
    const page = await db
      .prepare(
        `SELECT reporter_user_id,target_type,target_id,reason_code
      FROM reports WHERE status IN ('open','reviewing')
      GROUP BY reporter_user_id,target_type,target_id,reason_code HAVING COUNT(*)>1
      ORDER BY reporter_user_id,target_type,target_id,reason_code LIMIT 50`,
      )
      .all<{
        reporter_user_id: string;
        target_type: string;
        target_id: string;
        reason_code: string;
      }>();
    if (!page.results.length) break;
    for (const group of page.results) {
      const values = [
        group.reporter_user_id,
        group.target_type,
        group.target_id,
        group.reason_code,
      ];
      const auditId = newId();
      const auditFence = "EXISTS(SELECT 1 FROM audit_log WHERE id=?)";
      const results = await db.batch([
        db
          .prepare(
            `INSERT INTO audit_log(id,action,entity_type,entity_id,source_report_id,before_data,after_data,created_at)
          SELECT ?,'legacy_report_deduplication','report',id,id,
            (SELECT json_group_array(json_object('id',id,'reporter_user_id',reporter_user_id,
              'target_type',target_type,'target_id',target_id,'reason_code',reason_code,'note',note,
              'status',status,'resolved_by',resolved_by,'resolution_note',resolution_note,
              'created_at',created_at,'updated_at',updated_at,'resolved_at',resolved_at)) FROM (SELECT * FROM reports WHERE ${activeGroup} ORDER BY created_at,id)),
            json_object('canonicalReportId',id,'policy','Archive duplicate reports; retain their notes and original records.'),?
          FROM reports WHERE ${activeGroup} AND (SELECT COUNT(*) FROM reports WHERE ${activeGroup})>1
          ORDER BY created_at,id LIMIT 1`,
          )
          .bind(auditId, ...values, now, ...values, ...values),
        db
          .prepare(
            `UPDATE reports SET
          note=(SELECT group_concat(evidence, char(10) || char(10)) FROM
            (SELECT '[' || id || '] ' || note AS evidence FROM reports WHERE ${activeGroup} AND COALESCE(note,'')<>'' ORDER BY created_at,id)),
          status=CASE WHEN EXISTS(SELECT 1 FROM reports WHERE ${activeGroup} AND status='reviewing') THEN 'reviewing' ELSE 'open' END,
          updated_at=?
          WHERE id=(SELECT entity_id FROM audit_log WHERE id=?) AND ${auditFence}`,
          )
          .bind(...values, ...values, now, auditId, auditId),
        db
          .prepare(
            `UPDATE reports SET status='dismissed',resolved_at=?,updated_at=?,
          resolution_note=COALESCE(resolution_note || char(10),'') || 'Duplicate report retained in history; active report: ' || (SELECT entity_id FROM audit_log WHERE id=?)
          WHERE ${activeGroup} AND id<>(SELECT entity_id FROM audit_log WHERE id=?) AND ${auditFence}`,
          )
          .bind(now, now, auditId, ...values, auditId, auditId),
      ]);
      groups += results[0]!.meta.changes;
      archived += results[2]!.meta.changes;
    }
  }
  return { groups, archived };
}
