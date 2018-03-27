(function () {
  Handlebars.registerHelper('md', function(data) {
    return new Handlebars.SafeString(marked.inlineLexer(data, [], {}));
  });

  var select = document.getElementById.bind(document);

  var loadTemplate = function (id) {
    return Handlebars.compile(select(id).innerHTML);
  };

  var tagsTemplate = loadTemplate('tags-template');
  var logTemplate = loadTemplate('log-template');
  var sortedLogTemplate = loadTemplate('sorted-log-template');
  var errorTemplate = loadTemplate('error-template');

  var main = select('main');
  var log = select('log');
  var errorCard = select('error-card');

  var entryInput = select('entry-input');
  var entrySuggest = select('shadow-suggest');
  var entryTagSuggestions = select('entry-tag-suggestions');
  var entryButtonAdd = select('add-entry');
  var entryButtonDone = select('entry-done');

  var filterInput = select('filter-input');
  var filterSuggest = select('filter-shadow-suggest');
  var filterTagSuggestions = select('tag-suggestions');
  var filterShadowTagSuggestions = select('shadow-tag-suggestions');
  var filterButtonClear = select('clear-filter-input');

  var reportError = function (error) {
    var content = errorTemplate({ error: error });
    errorCard.innerHTML = content;
  };

  window.onscroll = function (event) {
    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight) {
      entryButtonAdd.classList.add('hidden');
    } else {
      entryButtonAdd.classList.remove('hidden');
    }
  };

  var hide = function (element) { element.classList.add('hidden') };
  var show = function (element) { element.classList.remove('hidden') };

  var hideTagSuggestions = function () {
    hide(filterTagSuggestions);
    hide(filterShadowTagSuggestions);
  };

  var showTagSuggestions = function () {
    show(filterTagSuggestions)
    show(filterShadowTagSuggestions);
  };

  var showClearFilterInput = function () { show(filterButtonClear) };
  var hideClearFilterInput = function () { hide(filterButtonClear) };

  var showEntrySuggestions = function () { show(entryTagSuggestions) };

  var hideEntrySuggestions = function () {
    hide(entryTagSuggestions)
    entrySuggest.innerHTML = '';
    main.classList.remove('faded');
  };

  var clearFilter = function () {
    filterInput.value = '';
    filterSuggest.innerHTML = '';
    if (document.activeElement === filterInput) {
      suggestFilterTags(tags);
    } else {
      hideClearFilterInput();
    }
    fetchSortedLog();
  };

  var clearEntry = function () {
    entryInput.value = '';
    hideEntrySuggestions();
    hideEntryDoneButton();
  };

  filterButtonClear.addEventListener('click', clearFilter);

  var showEntryDoneButton = function () { show(entryButtonDone) };
  var hideEntryDoneButton = function () { hide(entryButtonDone) };

  entryButtonDone.addEventListener('click', function (event) {
    saveEvent(entryInput.value);
  });

  entryInput.addEventListener('input', function (event) {
    if (entryInput.value) {
      showEntryDoneButton();
    } else {
      hideEntryDoneButton();
    }
  });

  select('insert-hashtag')
    .addEventListener('click', function (event) {
      event.preventDefault();
      entryInput.value += '#';
      entryInput.focus();
      showEntryDoneButton();
    });

  var scrollToBottom = function () {
    window.scrollTo(0, document.body.scrollHeight);
  };

  filterInput.addEventListener('focus', function (event) {
    var wasAtTheBottom = (
      (window.innerHeight + window.scrollY) >=
      document.body.offsetHeight
    )

    showClearFilterInput();
    suggestFilterTags(tags);
    if (wasAtTheBottom) scrollToBottom();
  });

  filterInput.addEventListener('blur', function (event) {
    setTimeout(function () {
      hideTagSuggestions();
      if (!filterInput.value) { hideClearFilterInput(); }
    }, 200);
  });

  entryButtonAdd.addEventListener('click', function (event) {
    entryInput.focus();
  });

  var handleClick = function (event) {
    if (event.target.tagName == 'CODE') {
      if (event.target.parentElement.id === 'entry-tag-suggestions') {
        var tag = '#' + event.target.innerHTML;
        entryInput.value = entryInput.value.replace(tagRegex, tag + ' ');
        hideEntrySuggestions();
        entryInput.focus();
      } else {
        var filter = event.target.innerHTML.replace('#', '');
        filterInput.value = filter;
        showClearFilterInput();
        hideTagSuggestions();
        fetchLog(filter);
      }
    }
  }

  document.addEventListener('click', handleClick);

  var tags = [];

  var suggestEntryTags = function (tags) {
    if (tags.length > 0) {
      showEntrySuggestions();
      var content = tagsTemplate(tags);
      entryTagSuggestions.innerHTML = content;
    } else {
      hideEntrySuggestions();
    }
  };

  var suggestFilterTags = function (tags) {
    if (tags.length > 0) {
      showTagSuggestions();
      var content = tagsTemplate(tags);
      filterTagSuggestions.innerHTML = content;
      filterShadowTagSuggestions.innerHTML = content;
    } else {
      hideTagSuggestions();
    }
  };

  var fetchTags = function () {
    fetch('api/tags')
      .then(function (response) {
        var futureContent = null;

        if (response.status == 200 || response.status == 400) {
          futureContent = response.json();
        } else {
          futureContent = response.text();
        }

        return futureContent.then(function (content) {
          return { success: response.status == 200, content: content };
        });
      })
      .then(function (response) {
        if (response.success) {
          tags = response.content;
        } else {
          reportError(response.content);
        }
      })
      .catch(function (reason) {
        console.error('request failed', reason);
        reportError(reason);
      });
  }

  var fetchLog = function (filter) {
    return fetch('api/log?filter=' + filter)
      .then(function (response) {
        var futureContent = null;

        if (response.status == 200 || response.status == 400) {
          futureContent = response.json();
        } else {
          futureContent = response.text();
        }

        return futureContent.then(function (content) {
          return { success: response.status == 200, content: content };
        });
      })
      .then(function (response) {
        if (response.success) {
          var content = logTemplate(response.content);
          log.innerHTML = content;
        } else {
          reportError(response.content);
        }
      })
      .catch(function (reason) {
        console.error('request failed', reason);
        reportError(reason);
      });
  }

  var fetchSortedLog = function () {
    return fetch('api/log-by-date')
      .then(function (response) {
        var futureContent = null;

        if (response.status == 200 || response.status == 400) {
          futureContent = response.json();
        } else {
          futureContent = response.text();
        }

        return futureContent.then(function (content) {
          return { success: response.status == 200, content: content };
        });
      })
      .then(function (response) {
        if (response.success) {
          var content = sortedLogTemplate(response.content);
          log.innerHTML = content;
        } else {
          reportError(response.content);
        }
      })
      .catch(function (reason) {
        console.error('request failed', reason);
        reportError(reason);
      });
  }

  var saveEvent = function (content) {
    var request = {
      method: 'POST',
      body: JSON.stringify(content),
      headers: { 'content-type': 'application/json' }
    }

    fetch('api/save', request)
      .catch(function (reason) {
        console.error('request failed', reason);
        reportError(reason);
      })
      .then(function (result) {
        return fetchTags();
      })
      .then(function (result) {
        return fetchSortedLog();
      })
      .then(function (result) {
        scrollToBottom();
        clearEntry();
      });
  }

  var processForm = function (cb) {
    return function (event) {
      if (event.preventDefault) event.preventDefault();
      cb(event.target);
      // prevent default form handler from running
      return false;
    }
  }

  var suggestedEntryTags = [];
  var suggestedEntryTagsFocus = -1;

  var suggestedFilterTags = [];
  var suggestedFilterTagsFocus = -1;

  var updateShadowSuggest = function (suggestElement, originalText, suggestedText) {
    var invisiblePart = new Handlebars.SafeString(
      "<span class='invisible'>" +
      suggestedText.substring(0, originalText.length) +
      "</span>"
    );

    var visiblePart = suggestedText.substring(originalText.length);
    suggestElement.innerHTML = invisiblePart + visiblePart;
  };

  var updateEntryShadowSuggest = function () {
    if (suggestedEntryTags.length > 0) {
      var focus = (suggestedEntryTags.length == 1) ? 0 : suggestedEntryTagsFocus;

      if (focus >= 0) {
        var tag = '#' + suggestedEntryTags[focus];
        var currentText = entryInput.value;
        var suggestedText = currentText.replace(tagRegex, tag);
        updateShadowSuggest(entrySuggest, currentText, suggestedText);
      } else {
        entrySuggest.innerHTML = '';
      }
      main.classList.add('faded');
    }
  };

  var updateFilterShadowSuggest = function () {
    if (suggestedFilterTags.length > 0) {
      var focus = (suggestedFilterTags.length == 1) ? 0 : suggestedFilterTagsFocus;

      if (focus >= 0) {
        var currentText = filterInput.value;
        var suggestedText = suggestedFilterTags[focus];
        updateShadowSuggest(filterSuggest, currentText, suggestedText);
      } else {
        filterSuggest.innerHTML = '';
      }
    } else {
      filterSuggest.innerHTML = '';
    }
  };

  var processFilterInput = processForm(function (target) {
    if (target.value) {
      fetchLog(target.value);
    } else {
      fetchSortedLog();
    }
  })

  var suggestFilterInput = processForm(function (target) {
    if (target.value) {
      suggestedFilterTagsFocus = -1;

      suggestedFilterTags = tags.filter(function (tag) {
        return tag.startsWith(target.value);
      });

      updateFilterShadowSuggest();

      if (suggestedFilterTags.length === 1 && suggestedFilterTags[0] === target.value) {
        hideTagSuggestions();
      } else {
        suggestFilterTags(suggestedFilterTags);
      }
    } else {
      suggestFilterTags(tags);
      filterSuggest.innerHTML = '';
    }
  })

  var tagRegex = /#[\w\d-_]+$/;

  var processEntryInput = processForm(function (target) {
    var lastTag = tagRegex.exec(entryInput.value);

    if (lastTag) {
      var incompleteTag = lastTag[0].replace('#', '');
      suggestedEntryTagsFocus = -1;

      suggestedEntryTags = tags.filter(function (tag) {
        return tag.startsWith(incompleteTag);
      });

      suggestEntryTags(suggestedEntryTags);
      updateEntryShadowSuggest();
    } else {
      hideEntrySuggestions();
    }
  })

  var processEntry = processForm(function (target) {
    if (entryInput.value) {
      saveEvent(entryInput.value);
      hideEntrySuggestions();
    }
  })

  var handleEvent = function (id, event, handler) {
    var element = select(id);

    if (element.addEventListener) {
      element.addEventListener(event, handler);
    } else {
      element.attachEvent(event, handler);
    }
  }

  var debounce = function (func, wait, immediate) {
    var timeout;

    return function executedFunction() {
      var context = this;
      var args = arguments;

      var later = function() {
        timeout = null;
        if (!immediate) func.apply(context, args);
      };

      var callNow = immediate && !timeout;
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
      if (callNow) func.apply(context, args);
    };
  };

  handleEvent('filter-input', 'input', debounce(processFilterInput, 250));
  handleEvent('filter-input', 'input', suggestFilterInput);
  handleEvent('entry-input', 'input', processEntryInput);
  handleEvent('entry-form', 'submit', processEntry);

  fetchTags();
  fetchSortedLog();

  if (
    window.matchMedia &&
    window.matchMedia("(min-device-width: 768px)").matches
  ) {
    entryInput.focus();
  }

  document.onkeydown = function (event) {
    var isEscape = false;

    /* ESC */
    if (event.keyCode == 27) {
      if (document.activeElement === entryInput && entryInput.value !== '') {
        clearEntry();
      } else if (document.activeElement === filterInput) {
        if (filterInput.value === '') {
          hideTagSuggestions();
          hideClearFilterInput();
          filterInput.blur();
        } else {
          clearFilter();
        }
      } else if (filterInput.value !== '') {
        clearFilter();
      }

      return false;

    // tab
    } else if (event.keyCode == 9) {
      if (document.activeElement == entryInput) {
        if (suggestedEntryTags.length == 1) {
          var tag = '#' + suggestedEntryTags[0];
          entryInput.value = entryInput.value.replace(tagRegex, tag + ' ');
          hideEntrySuggestions();
        } else {
          suggestedEntryTagsFocus += 1;
          suggestedEntryTagsFocus %= (suggestedEntryTags.length + 1);
          if (suggestedEntryTagsFocus === suggestedEntryTags.length) {
            suggestedEntryTagsFocus = -1;
          }
          updateEntryShadowSuggest();
        }

        return false;

      } else if (document.activeElement === filterInput) {
        if (suggestedFilterTags.length == 1) {
          var tag = suggestedFilterTags[0];
          filterInput.value = tag;
          hideTagSuggestions();
          fetchLog(filterInput.value);
        } else {
          suggestedFilterTagsFocus += 1;
          suggestedFilterTagsFocus %= (suggestedFilterTags.length + 1);
          if (suggestedFilterTagsFocus === suggestedFilterTags.length) {
            suggestedFilterTagsFocus = -1;
          }
          updateFilterShadowSuggest();
        }

        return false;
      }

    // space
    } else if (event.keyCode == 32) {
      if (document.activeElement == entryInput) {
        if (suggestedEntryTagsFocus >= 0) {
          var tag = '#' + suggestedEntryTags[suggestedEntryTagsFocus];
          entryInput.value = entryInput.value.replace(tagRegex, tag + ' ');
          hideEntrySuggestions();
          return false;
        }

      } else if (document.activeElement === filterInput) {
        if (suggestedFilterTagsFocus >= 0) {
          var tag = suggestedFilterTags[suggestedFilterTagsFocus];
          filterInput.value = tag;
          hideTagSuggestions();
          fetchLog(filterInput.value);
          return false;
        }

      }
    }
  };
})();
