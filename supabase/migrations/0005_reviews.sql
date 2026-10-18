-- Tenant reviews: unverified opinions renters post about an address, kept apart from the open data.
--
-- Additive only. The API roles get no access to the table itself: the app reads and writes through the
-- three bb_* functions below, which validate input and throttle posting, because the publishable key the
-- app uses is public and could call PostgREST directly.

create table if not exists reviews (
    id               bigint generated always as identity primary key,
    address_point_id bigint not null references address_points,
    rating           smallint not null check (rating between 1 and 5),
    body             text not null check (char_length(body) between 20 and 1000),
    author           text check (author is null or char_length(author) between 1 and 40),
    created_at       timestamptz not null default now(),
    report_count     int not null default 0,
    hidden           boolean not null default false
);
create index if not exists reviews_address on reviews (address_point_id, created_at desc);

revoke all on table reviews from anon, authenticated;
alter table reviews enable row level security;

-- Visible reviews for an address, newest first, with the average and count.
create or replace function bb_reviews(p_address_point_id bigint)
returns jsonb language sql stable security definer set search_path = public as $$
    select jsonb_build_object(
        'count', count(*),
        'average', round(avg(rating)::numeric, 1),
        'items', coalesce(jsonb_agg(jsonb_build_object(
            'id', id, 'rating', rating, 'body', body, 'author', author, 'created_at', created_at)
            order by created_at desc), '[]'::jsonb))
      from (select * from reviews
             where address_point_id = p_address_point_id and not hidden
             order by created_at desc limit 100) r
$$;

-- Post a review. Returns the new review, or raises with a message the app can show.
create or replace function bb_add_review(p_address_point_id bigint, p_rating int, p_body text, p_author text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare
    v_body   text := btrim(regexp_replace(coalesce(p_body, ''), '[[:cntrl:]]+', ' ', 'g'));
    v_author text := nullif(btrim(regexp_replace(coalesce(p_author, ''), '[[:cntrl:]]+', ' ', 'g')), '');
    r      reviews;
begin
    if p_rating is null or p_rating not between 1 and 5 then
        raise exception 'Pick a rating from 1 to 5.' using errcode = '22023';
    end if;
    if char_length(v_body) not between 20 and 1000 then
        raise exception 'Write between 20 and 1,000 characters.' using errcode = '22023';
    end if;
    if v_author is not null and char_length(v_author) > 40 then
        raise exception 'Keep the name to 40 characters.' using errcode = '22023';
    end if;
    if not exists (select 1 from address_points where address_point_id = p_address_point_id) then
        raise exception 'Unknown address.' using errcode = '22023';
    end if;
    -- Throttles that hold even when the API's per-IP limit is bypassed.
    if (select count(*) from reviews
         where address_point_id = p_address_point_id and created_at > now() - interval '1 hour') >= 5 then
        raise exception 'This address has had several reviews in the last hour. Try again later.' using errcode = 'P0001';
    end if;
    if (select count(*) from reviews where created_at > now() - interval '10 minutes') >= 60 then
        raise exception 'Reviews are busy right now. Try again in a few minutes.' using errcode = 'P0001';
    end if;
    if exists (select 1 from reviews
                where address_point_id = p_address_point_id and reviews.body = v_body
                  and created_at > now() - interval '1 day') then
        raise exception 'That review is already posted.' using errcode = 'P0001';
    end if;

    insert into reviews (address_point_id, rating, body, author)
    values (p_address_point_id, p_rating, v_body, v_author)
    returning * into r;
    return jsonb_build_object('id', r.id, 'rating', r.rating, 'body', r.body, 'author', r.author, 'created_at', r.created_at);
end $$;

-- Report a review; three reports hide it until someone looks.
create or replace function bb_report_review(p_id bigint)
returns jsonb language sql volatile security definer set search_path = public as $$
    update reviews set report_count = report_count + 1, hidden = hidden or report_count + 1 >= 3
     where id = p_id
    returning jsonb_build_object('id', id, 'hidden', hidden)
$$;

revoke all on function bb_reviews(bigint) from public;
revoke all on function bb_add_review(bigint, int, text, text) from public;
revoke all on function bb_report_review(bigint) from public;
grant execute on function bb_reviews(bigint) to anon, authenticated;
grant execute on function bb_add_review(bigint, int, text, text) to anon, authenticated;
grant execute on function bb_report_review(bigint) to anon, authenticated;
