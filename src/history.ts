import { window, workspace } from "vscode";
import {
  baseCommand,
  formatGithubBranchName,
  formatGitHubWikiPageUrl,
  isGitHubWiki,
  isGitHubWikiPage,
  SelectedLines,
  Action,
  RemoteURLMappings,
} from "./common";
import { formatBitbucketServerUrl } from "./bitbucketServer";

export default function historyCommand(action: Action) {
  return () =>
    baseCommand("history", action, {
      github: formatGitHubHistoryUrl,
      bitbucket: formatBitbucketHistoryUrl,
      bitbucketServer: formatBitbucketServerUrl,
      gitlab: formatGitHubHistoryUrl,
    });
}

export function formatGitHubHistoryUrl(
  derivedRemote: string,
  branch: string,
  filePath: string,
  remoteURLMappings: RemoteURLMappings = {},
  lines?: SelectedLines
): string {
  const remote =
    derivedRemote in remoteURLMappings
      ? remoteURLMappings[derivedRemote]
      : derivedRemote;
  if (isGitHubWiki(remote)) {
    const wikiUrl = formatGitHubWikiPageUrl(remote, filePath);
    return isGitHubWikiPage(filePath) ? `${wikiUrl}/_history` : wikiUrl;
  }
  return `${remote}/commits/${formatGithubBranchName(branch)}/${filePath}`;
}

export function formatBitbucketHistoryUrl(
  derivedRemote: string,
  branch: string,
  filePath: string,
  remoteURLMappings: RemoteURLMappings = {},
  lines?: SelectedLines
): string {
  const remote =
    derivedRemote in remoteURLMappings
      ? remoteURLMappings[derivedRemote]
      : derivedRemote;
  return `${remote}/history-node/${branch}/${filePath}`;
}
