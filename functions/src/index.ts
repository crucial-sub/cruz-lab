// Firebase Functions: Firestore 포스트 변경 시 GitHub에 자동 커밋
// 블로그 포스트를 MD 파일로 변환하여 GitHub 레포지토리에 저장

import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { defineSecret } from "firebase-functions/params";

// GitHub 관련 시크릿 정의
const githubToken = defineSecret("GITHUB_TOKEN");

// GitHub 레포지토리 설정
const GITHUB_OWNER = "crucial-sub"; // GitHub 사용자명
const GITHUB_REPO = "cruz-lab"; // 레포지토리 이름
const GITHUB_BRANCH = "main"; // 브랜치 이름
const POSTS_PATH = "content/posts"; // MD 파일 저장 경로

// 포스트 데이터 타입
interface PostData {
  title: string;
  description: string;
  content: string;
  heroImage: string;
  tags: string[];
  slug: string;
  status: "draft" | "published";
  pubDate: { toDate: () => Date } | Date;
  updatedDate: { toDate: () => Date } | Date;
  readingTime: number;
  isPublic: boolean;
}

// 날짜를 ISO 문자열로 변환
function toISOString(date: { toDate: () => Date } | Date): string {
  if (date && typeof (date as any).toDate === "function") {
    return (date as { toDate: () => Date }).toDate().toISOString();
  }
  return (date as Date).toISOString();
}

// 포스트 데이터를 Markdown frontmatter 형식으로 변환
function generateMarkdownContent(post: PostData): string {
  const pubDate = toISOString(post.pubDate);
  const updatedDate = toISOString(post.updatedDate);

  // YAML frontmatter 생성
  const frontmatter = `---
title: "${post.title.replace(/"/g, '\\"')}"
description: "${post.description.replace(/"/g, '\\"')}"
pubDate: "${pubDate}"
updatedDate: "${updatedDate}"
heroImage: "${post.heroImage || ""}"
tags: [${post.tags.map((tag) => `"${tag}"`).join(", ")}]
slug: "${post.slug}"
readingTime: ${post.readingTime}
isPublic: ${post.isPublic}
---`;

  return `${frontmatter}\n\n${post.content}`;
}

// 파일명 생성 (날짜-slug.md 형식)
function generateFileName(post: PostData): string {
  const date = toISOString(post.pubDate).split("T")[0]; // YYYY-MM-DD
  const safeSlug = post.slug.replace(/[^a-z0-9가-힣-]/gi, "-").toLowerCase();
  return `${date}-${safeSlug}.md`;
}

// GitHub API를 사용하여 파일 생성/업데이트
async function commitToGitHub(
  token: string,
  filePath: string,
  content: string,
  message: string
): Promise<{ success: boolean; sha?: string; error?: string }> {
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;

  try {
    // 기존 파일 확인 (SHA 필요)
    let existingSha: string | undefined;
    const getResponse = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "cruz-lab-functions",
      },
    });

    if (getResponse.ok) {
      const existingFile = (await getResponse.json()) as { sha: string };
      existingSha = existingFile.sha;
    }

    // 파일 생성/업데이트
    const body: {
      message: string;
      content: string;
      branch: string;
      sha?: string;
    } = {
      message,
      content: Buffer.from(content).toString("base64"),
      branch: GITHUB_BRANCH,
    };

    if (existingSha) {
      body.sha = existingSha;
    }

    const putResponse = await fetch(apiUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "cruz-lab-functions",
      },
      body: JSON.stringify(body),
    });

    if (!putResponse.ok) {
      const error = await putResponse.text();
      return { success: false, error };
    }

    const result = (await putResponse.json()) as { content: { sha: string } };
    return { success: true, sha: result.content.sha };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// GitHub에서 파일 삭제
async function deleteFromGitHub(
  token: string,
  filePath: string,
  message: string
): Promise<{ success: boolean; error?: string }> {
  const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;

  try {
    // 기존 파일 SHA 가져오기
    const getResponse = await fetch(apiUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "cruz-lab-functions",
      },
    });

    if (!getResponse.ok) {
      // 파일이 없으면 삭제할 필요 없음
      return { success: true };
    }

    const existingFile = (await getResponse.json()) as { sha: string };

    // 파일 삭제
    const deleteResponse = await fetch(apiUrl, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "cruz-lab-functions",
      },
      body: JSON.stringify({
        message,
        sha: existingFile.sha,
        branch: GITHUB_BRANCH,
      }),
    });

    if (!deleteResponse.ok) {
      const error = await deleteResponse.text();
      return { success: false, error };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// Firestore 트리거: posts 컬렉션 문서 변경 시 실행
export const syncPostToGitHub = onDocumentWritten(
  {
    document: "posts/{postId}",
    secrets: [githubToken],
  },
  async (event) => {
    const token = githubToken.value();

    if (!token) {
      console.error("GitHub 토큰이 설정되지 않았습니다.");
      return;
    }

    const beforeData = event.data?.before.data() as PostData | undefined;
    const afterData = event.data?.after.data() as PostData | undefined;

    // 문서 삭제 처리
    if (!afterData && beforeData) {
      // 발행된 포스트만 GitHub에서 삭제
      if (beforeData.status === "published") {
        const fileName = generateFileName(beforeData);
        const filePath = `${POSTS_PATH}/${fileName}`;
        const result = await deleteFromGitHub(
          token,
          filePath,
          `🗑️ 포스트 삭제: ${beforeData.title}`
        );

        if (!result.success) {
          console.error("GitHub 삭제 실패:", result.error);
        } else {
          console.log(`GitHub에서 삭제됨: ${filePath}`);
        }
      }
      return;
    }

    // 문서 생성/수정 처리
    if (afterData) {
      // draft 상태면 GitHub에 커밋하지 않음
      if (afterData.status !== "published") {
        console.log("Draft 상태이므로 GitHub 동기화 건너뜀");

        // 이전에 발행된 상태였다면 GitHub에서 삭제
        if (beforeData?.status === "published") {
          const fileName = generateFileName(beforeData);
          const filePath = `${POSTS_PATH}/${fileName}`;
          await deleteFromGitHub(
            token,
            filePath,
            `📝 Draft로 전환: ${afterData.title}`
          );
        }
        return;
      }

      // slug가 변경된 경우, 이전 파일 삭제
      if (beforeData && beforeData.slug !== afterData.slug) {
        const oldFileName = generateFileName(beforeData);
        const oldFilePath = `${POSTS_PATH}/${oldFileName}`;
        await deleteFromGitHub(
          token,
          oldFilePath,
          `🔄 URL 변경으로 이전 파일 삭제: ${beforeData.slug}`
        );
      }

      // 새 파일 생성/업데이트
      const fileName = generateFileName(afterData);
      const filePath = `${POSTS_PATH}/${fileName}`;
      const markdownContent = generateMarkdownContent(afterData);

      const isNew = !beforeData || beforeData.status !== "published";
      const commitMessage = isNew
        ? `✨ 새 포스트 발행: ${afterData.title}`
        : `📝 포스트 수정: ${afterData.title}`;

      const result = await commitToGitHub(
        token,
        filePath,
        markdownContent,
        commitMessage
      );

      if (!result.success) {
        console.error("GitHub 커밋 실패:", result.error);
      } else {
        console.log(`GitHub에 커밋됨: ${filePath} (SHA: ${result.sha})`);
      }
    }
  }
);
