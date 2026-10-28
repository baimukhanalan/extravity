DO $$
DECLARE
  item text;
BEGIN
  FOREACH item IN ARRAY ARRAY[
    'SubmissionReceipt',
    'SubmissionAttempt',
    'SubmissionJob',
    'SubmissionConnector',
    'ApplicationApproval',
    'ApplicationSnapshotDocument',
    'ApplicationSnapshot',
    'EligibilityDecision',
    'OpportunityRequirementSet',
    'ProfileFieldVersion',
    'Auto' || 'ApplyAuthorization',
    'Auto' || 'ApplyPreference',
    'Auto' || 'ApplySafetyControl'
  ]
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I CASCADE', item);
  END LOOP;
END $$;

DO $$
DECLARE
  item text;
BEGIN
  FOREACH item IN ARRAY ARRAY[
    'SubmissionJobStatus',
    'SubmissionConnectorType',
    'ApplicationApprovalActor',
    'ApplicationSnapshotStatus',
    'Auto' || 'ApplyEligibilityStatus'
  ]
  LOOP
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = item) THEN
      EXECUTE format('DROP TYPE %I', item);
    END IF;
  END LOOP;
END $$;

