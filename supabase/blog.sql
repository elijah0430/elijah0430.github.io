-- One-time setup for the blog on elijah0430.github.io.
--
-- 1. Run this file in the existing Supabase project's SQL Editor.
-- 2. In Authentication > Users, create and auto-confirm this user:
--      elijah0430@blog.local
-- 3. Set the password in the Supabase dashboard. Never add it to this repository.

create extension if not exists pgcrypto;

create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (char_length(slug) between 1 and 200),
  title text not null check (char_length(title) between 1 and 180),
  summary text check (summary is null or char_length(summary) <= 360),
  body text not null check (char_length(body) between 1 and 100000),
  published_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.blog_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  author_name text not null check (char_length(author_name) between 1 and 60),
  body text not null check (char_length(body) between 1 and 2000),
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists blog_posts_published_at_idx
  on public.blog_posts (published_at desc);

create index if not exists blog_comments_post_id_created_at_idx
  on public.blog_comments (post_id, created_at asc);

create or replace function public.set_blog_post_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_blog_post_updated_at on public.blog_posts;
create trigger set_blog_post_updated_at
before update on public.blog_posts
for each row execute function public.set_blog_post_updated_at();

alter table public.blog_posts enable row level security;
alter table public.blog_comments enable row level security;

grant select on public.blog_posts to anon, authenticated;
grant insert, update, delete on public.blog_posts to authenticated;
grant select, insert on public.blog_comments to anon, authenticated;
grant update, delete on public.blog_comments to authenticated;

drop policy if exists "Public can read blog posts" on public.blog_posts;
create policy "Public can read blog posts"
on public.blog_posts for select
to anon, authenticated
using (published_at <= now());

drop policy if exists "Admin can create blog posts" on public.blog_posts;
create policy "Admin can create blog posts"
on public.blog_posts for insert
to authenticated
with check ((auth.jwt() ->> 'email') = 'elijah0430@blog.local');

drop policy if exists "Admin can update blog posts" on public.blog_posts;
create policy "Admin can update blog posts"
on public.blog_posts for update
to authenticated
using ((auth.jwt() ->> 'email') = 'elijah0430@blog.local')
with check ((auth.jwt() ->> 'email') = 'elijah0430@blog.local');

drop policy if exists "Admin can delete blog posts" on public.blog_posts;
create policy "Admin can delete blog posts"
on public.blog_posts for delete
to authenticated
using ((auth.jwt() ->> 'email') = 'elijah0430@blog.local');

drop policy if exists "Public can read visible comments" on public.blog_comments;
create policy "Public can read visible comments"
on public.blog_comments for select
to anon, authenticated
using (is_hidden = false);

drop policy if exists "Public can create comments" on public.blog_comments;
create policy "Public can create comments"
on public.blog_comments for insert
to anon, authenticated
with check (
  is_hidden = false
  and char_length(author_name) between 1 and 60
  and char_length(body) between 1 and 2000
);

drop policy if exists "Admin can moderate comments" on public.blog_comments;
create policy "Admin can moderate comments"
on public.blog_comments for update
to authenticated
using ((auth.jwt() ->> 'email') = 'elijah0430@blog.local')
with check ((auth.jwt() ->> 'email') = 'elijah0430@blog.local');

drop policy if exists "Admin can delete comments" on public.blog_comments;
create policy "Admin can delete comments"
on public.blog_comments for delete
to authenticated
using ((auth.jwt() ->> 'email') = 'elijah0430@blog.local');
