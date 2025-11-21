let ciUser;

module.exports = async ({ github, context }, env = {}) => {
  const sourceBranch = 'main';
  const targetBranch = env.TARGET_BRANCH;
  const sourceSha = env.SOURCE_SHA;
  ciUser = env.CI_USER ?? '';

  console.log(`Creating mergeback PR from ${sourceBranch} to ${targetBranch}`);
  console.log(`Using SHA: ${sourceSha}`);

  await createMergeBackPullRequest({ github, context }, sourceBranch, targetBranch, sourceSha);
  console.log('Finished creating pull request');
};

async function createMergeBackPullRequest({ github, context }, sourceBranch, targetBranch, sourceSha) {
  const sourceBranchWithSha = `${sourceSha.substring(0, 7)}/${sourceBranch}`;

  try {
    const newBranchName = `merge-back-${sourceBranchWithSha}-into-${targetBranch}`;
    console.log(`Creating mergeback: ${newBranchName}`);

    // Create new branch from base branch
    const newMergeBranch = await github.rest.git.createRef({
      owner: context.repo.owner,
      repo: context.repo.repo,
      ref: `refs/heads/${newBranchName}`,
      sha: sourceSha,
    });

    const user = context.payload.sender.login;
    const assignees = [];
    // Exclude CI account from tagging
    if (user !== ciUser) {
      assignees.push(user);
    }

    // Create pull request to merge
    const createdPR = await github.rest.pulls.create({
      owner: context.repo.owner,
      repo: context.repo.repo,
      title: `[BOT] Merge back: ${sourceBranchWithSha} into ${targetBranch} 🤖`,
      body: `Automatic merging back ${sourceBranchWithSha} into ${targetBranch}! ${assignees
        .map((assignee) => `@${assignee}`)
        .join(' ')} Please verify that the merge is correct.`,
      head: newBranchName,
      base: targetBranch,
    });

    // Add responsible author as an assignee
    await github.rest.issues.addAssignees({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: createdPR.data.number,
      assignees,
    });

    console.log(`Successfully created PR: ${createdPR.data.html_url}`);
  } catch (error) {
    console.error(`Failed to create pull request from ${sourceBranchWithSha} into ${targetBranch}`);
    console.error(`Error details: ${error.message}`);
    throw error;
  }
}
